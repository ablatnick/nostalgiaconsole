// Dashboard styles other than the built-in 360 metro pivots. Each module
// exports a function (ctx, root) returning a view:
//   { id, render(), layout(), current(), handle(action) -> handled,
//     home() -> moved, goto(sectionKey), hints() -> [[button, label]], destroy() }
// ctx gives the shared data (ctx.catalog() sections of tiles) and helpers;
// A, X, Y, menu and the guide are handled for every style by app.js.
import xmb from './xmb.js';
import wii from './wii.js';
import nxe from './nxe.js';
import blades from './blades.js';

export const LOOK_MODULES = { nxe, blades, xmb, wii };
