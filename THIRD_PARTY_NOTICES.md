# Third-party notices

The released `main.js` bundles the following third-party software, unmodified.

## elkjs

- Version: 0.12.0 (see `package.json`)
- Project: Eclipse Layout Kernel for JavaScript — https://github.com/kieler/elkjs
- Copyright (c) 2017 Kiel University and others; Copyright (c) 2019 TypeFox and others
- License: **Eclipse Public License 2.0** (EPL-2.0), with GPL-3.0-or-later as a secondary license.
  Full text: https://www.eclipse.org/legal/epl-2.0/
- Source code: available at https://github.com/kieler/elkjs and in the `elkjs` package on npm.

DB Atlas uses elkjs only to compute the initial position of tables. It is included as a separate,
unmodified component (the layout worker script is embedded as text and started in a Web Worker);
the rest of DB Atlas is licensed under the MIT License (see `LICENSE`).
