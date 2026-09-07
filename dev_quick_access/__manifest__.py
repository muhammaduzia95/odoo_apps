{
    "name": "Developer Quick Access",
    "version": "19.0.1.0.0",
    "summary": "Search apps, menus, actions & models from the systray and jump straight there — Community & Enterprise.",
    "description": """
        Developer Quick Access
        ======================

        Adds a search icon to the systray (top bar), shown whenever developer
        mode is active. Works in both Community and Enterprise.

        Open it with the icon or the Alt+Shift+D shortcut, then type anything:
          * Apps (Sales, Purchase, POS…) shown with their real icon
          * Technical / settings menus (ir.ui.menu), by their full path
          * Window actions with their configured views & filters (ir.actions.act_window)
          * Any model (ir.model) — resolves to its window action, or a generic view

        Navigate results with the arrow keys, Enter to open, Escape to close.
        Apps open on their real landing view (Sales -> Quotations), exactly like
        clicking the app. Every result opens in a new browser tab and carries
        your developer mode across, so the view you were working in is left
        untouched.

        From a Sale Order? Type "purchase" and jump straight to Purchase Orders —
        no more digging through Settings -> Technical.

        Highlights
        ----------
          * One search over apps, menus, actions and models
          * Keyboard-first: Alt+Shift+D to open, arrows / Enter / Escape to drive
          * Opens in a new tab with developer mode preserved
          * No configuration, no server-side models — depends on 'web' only
    """,
    "category": "Technical",
    "author": "ziaindev",
    "website": "https://muhammadusamazia.dev",
    "license": "LGPL-3",
    'images': ['static/description/banner.png'],
    'live_test_url': 'https://youtu.be/IiCNMi-3bR4',

    "depends": ["web"],
    "assets": {
        "web.assets_backend": [
            "dev_quick_access/static/src/scss/dev_quick_access.scss",
            "dev_quick_access/static/src/js/dev_quick_access.js",
            "dev_quick_access/static/src/xml/dev_quick_access.xml",
        ],
    },
    "installable": True,
    "application": False,
    "auto_install": False,

}
