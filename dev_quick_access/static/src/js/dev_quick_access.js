/** @odoo-module **/

import { Component, useState, useRef, onMounted, useEffect } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { Dialog } from "@web/core/dialog/dialog";
import { useDebounced } from "@web/core/utils/timing";
import { browser } from "@web/core/browser/browser";

/**
 * The search palette. Queries menus, window actions and models in parallel,
 * then navigates to whatever the developer picks.
 */
export class DevQuickAccessDialog extends Component {
    static template = "dev_quick_access.Dialog";
    static components = { Dialog };
    static props = { close: Function };

    setup() {
        this.orm = useService("orm");
        this.inputRef = useRef("searchInput");
        this.state = useState({
            query: "",
            results: [],
            loading: false,
            activeIndex: 0,
        });
        this.search = useDebounced(this.search.bind(this), 200);
        onMounted(() => this.inputRef.el && this.inputRef.el.focus());

        // Keep the highlighted result visible while navigating with the keyboard.
        useEffect(
            () => {
                const el = document.querySelector(
                    ".o_dev_qa_result.o_dev_qa_active"
                );
                if (el) {
                    el.scrollIntoView({ block: "nearest" });
                }
            },
            () => [this.state.activeIndex, this.state.results]
        );
    }

    onInput(ev) {
        this.state.query = ev.target.value;
        this.search();
    }

    async search() {
        const q = this.state.query.trim();
        if (!q) {
            this.state.results = [];
            return;
        }
        this.state.loading = true;
        try {
            const [apps, menus, actions, models] = await Promise.all([
                // Root app menus (Sales, Purchase, Apps, POS…) — these carry the
                // colourful app icon in web_icon_data.
                this.orm.searchRead(
                    "ir.ui.menu",
                    [["parent_id", "=", false], ["name", "ilike", q]],
                    ["name", "web_icon_data", "action"],
                    { limit: 15 }
                ),
                // Submenus only (root apps are handled above).
                this.orm.searchRead(
                    "ir.ui.menu",
                    [["parent_id", "!=", false], ["name", "ilike", q]],
                    ["name", "complete_name", "action"],
                    { limit: 15 }
                ),
                this.orm.searchRead(
                    "ir.actions.act_window",
                    [["name", "ilike", q]],
                    ["name", "res_model"],
                    { limit: 15 }
                ),
                this.orm.searchRead(
                    "ir.model",
                    ["|", ["name", "ilike", q], ["model", "ilike", q]],
                    ["name", "model"],
                    { limit: 15 }
                ),
            ]);

            const results = [];

            // Root apps first, with their real icon.
            for (const app of apps) {
                results.push({
                    type: "app",
                    key: `app_${app.id}`,
                    label: app.name,
                    sub: "App",
                    icon: app.web_icon_data || null,
                    action: app.action || null,
                    menuId: app.id,
                });
            }

            // Menus (skip container menus that have no action).
            for (const m of menus) {
                if (!m.action) {
                    continue;
                }
                results.push({
                    type: "menu",
                    key: `menu_${m.id}`,
                    label: m.complete_name || m.name,
                    sub: "Menu",
                    action: m.action,
                });
            }

            // Real window actions — keep their configured views & filters.
            for (const a of actions) {
                results.push({
                    type: "action",
                    key: `action_${a.id}`,
                    label: a.name,
                    sub: a.res_model ? `Action · ${a.res_model}` : "Action",
                    actionId: a.id,
                });
            }

            // Raw models — generic list/form fallback.
            for (const mo of models) {
                results.push({
                    type: "model",
                    key: `model_${mo.id}`,
                    label: mo.name,
                    sub: `Model · ${mo.model}`,
                    model: mo.model,
                });
            }

            this.state.results = results;
            this.state.activeIndex = 0;
        } finally {
            this.state.loading = false;
        }
    }

    /**
     * Resolve a result to an Odoo 19 web URL. We navigate by URL (in a new tab)
     * rather than doAction(), so the current view is left untouched.
     */
    async _urlFor(res) {
        if (res.type === "app") {
            // App root: use its own action if it has one, otherwise the first
            // actionable menu walking the tree depth-first in sequence order —
            // this is what Odoo does natively (e.g. Sales -> Quotations, not
            // whichever deep menu happens to have the lowest raw sequence).
            if (res.action) {
                return `/odoo/action-${parseInt(res.action.split(",")[1], 10)}`;
            }
            const nodes = await this.orm.searchRead(
                "ir.ui.menu",
                [["id", "child_of", res.menuId]],
                ["parent_id", "sequence", "action"],
                { order: "sequence, id" }
            );
            const nodeById = {};
            const childrenOf = {};
            for (const n of nodes) {
                nodeById[n.id] = n;
                const pid = n.parent_id ? n.parent_id[0] : false;
                (childrenOf[pid] = childrenOf[pid] || []).push(n);
            }
            const firstAction = (menuId) => {
                const node = nodeById[menuId];
                if (node && node.action) {
                    return node.action;
                }
                for (const child of childrenOf[menuId] || []) {
                    const found = firstAction(child.id);
                    if (found) {
                        return found;
                    }
                }
                return null;
            };
            const action = firstAction(res.menuId);
            if (action) {
                return `/odoo/action-${parseInt(action.split(",")[1], 10)}`;
            }
            return "/odoo";
        }
        if (res.type === "menu") {
            // res.action looks like "ir.actions.act_window,123"
            const actionId = parseInt(res.action.split(",")[1], 10);
            return `/odoo/action-${actionId}`;
        }
        if (res.type === "action") {
            return `/odoo/action-${res.actionId}`;
        }
        // Model result: there's no action attached, so find a real window action
        // for this model and open that. Odoo 19 has no bare-model route, so the
        // legacy "/web#model=..." hash just dumps you on the home screen.
        const [act] = await this.orm.searchRead(
            "ir.actions.act_window",
            [["res_model", "=", res.model]],
            ["id"],
            { limit: 1 }
        );
        if (act) {
            return `/odoo/action-${act.id}`;
        }
        // No action exists for this model — fall back to the legacy hash. Rare,
        // and mostly for abstract/technical models with no configured view.
        return `/web#model=${encodeURIComponent(res.model)}&view_type=list`;
    }

    async openResult(res) {
        // Open in a new browser tab, carrying the current developer-mode flag
        // so technical menus/actions render there just like in this tab.
        const url = await this._urlFor(res);
        browser.open(this._withDebug(url), "_blank");
        this.props.close();
    }

    _withDebug(url) {
        // Propagate the active debug mode ("1", "1,assets"…) as a query param,
        // inserted before any "#" fragment. Defaults to "1" since the palette
        // is only reachable in developer mode anyway.
        const debug = this.env.debug || "1";
        const [path, hash] = url.split("#");
        const sep = path.includes("?") ? "&" : "?";
        const withParam = `${path}${sep}debug=${encodeURIComponent(debug)}`;
        return hash ? `${withParam}#${hash}` : withParam;
    }

    faIcon(res) {
        return (
            {
                app: "fa-th",
                menu: "fa-sitemap",
                action: "fa-bolt",
                model: "fa-database",
            }[res.type] || "fa-circle-o"
        );
    }

    setActive(index) {
        this.state.activeIndex = index;
    }

    onKeydown(ev) {
        const results = this.state.results;
        if (ev.key === "ArrowDown") {
            ev.preventDefault();
            this.state.activeIndex = Math.min(this.state.activeIndex + 1, results.length - 1);
        } else if (ev.key === "ArrowUp") {
            ev.preventDefault();
            this.state.activeIndex = Math.max(this.state.activeIndex - 1, 0);
        } else if (ev.key === "Enter") {
            ev.preventDefault();
            const res = results[this.state.activeIndex];
            if (res) {
                this.openResult(res);
            }
        } else if (ev.key === "Escape") {
            this.props.close();
        }
    }
}

/**
 * The systray button. Always shown — not gated behind developer mode.
 */
export class DevQuickAccessSystray extends Component {
    static template = "dev_quick_access.Systray";

    setup() {
        this.dialog = useService("dialog");
        this.hotkey = useService("hotkey");
        this.isOpen = false;

        // Global shortcut — fires anywhere, even while focused in a field/editor.
        this.hotkey.add("alt+shift+d", () => this.open(), {
            global: true,
            bypassEditableProtection: true,
        });
    }

    onClick() {
        this.open();
    }

    open() {
        // Don't stack a second palette if one is already showing.
        if (this.isOpen) {
            return;
        }
        this.isOpen = true;
        this.dialog.add(
            DevQuickAccessDialog,
            {},
            { onClose: () => (this.isOpen = false) }
        );
    }
}

registry.category("systray").add(
    "dev_quick_access.DevQuickAccessSystray",
    {
        Component: DevQuickAccessSystray,
        isDisplayed: (env) => Boolean(env.debug),
    },
    { sequence: 101 }
);

