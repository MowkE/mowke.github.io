# The Ninth Observatory

An optional spatial entrance to Samahith Thellakal’s nine science instruments. Open `observatory/` from the portfolio’s navigation or invitation panel. The original atlas and all individual project repositories are unchanged.

## Creative brief

Create an explorable Three.js world that turns nine projects into physical exhibits. Adapt OpenTrade’s spatial discovery and distinctive physical stations into an original nocturnal observatory with a cutaway stone rotunda, brass meridians, an open oculus, and a monumental armillary. Every exhibit should be recognizable, animated, easy to discover, and linked to the full instrument. Support guided camera travel, free walking, touch, keyboard navigation, reduced motion, and a usable directory when WebGL is unavailable.

## Visit

Serve the portfolio root with any static HTTP server. There is no build step. The existing local address is `http://localhost:8104/observatory/`.

- **Begin the visit** opens the first exhibit. The arrows or **1–9** select any instrument.
- **Overview** returns to the rotunda. Drag to orbit. Scroll or pinch to zoom.
- **Walk** enters the floor. **WASD / arrows** move, drag looks, **Shift** moves faster, **E** inspects an exhibit when facing it nearby. Touch devices have a direction pad.
- **Escape** returns to overview. A dialog consumes Escape first.
- The exhibit index provides both camera visits and ordinary links to all nine projects.
- Full instruments open in a new tab, preserving the observatory.
- Sculpture motion can be paused. Reduced motion starts paused and removes camera travel animations. Ambient sound starts off and requires a click.
- `?exhibit=apsis` (or another project name) opens a specific exhibit.

## Structure

- `main.js` handles the interface, camera travel, navigation, collision boundaries, sound, and graceful failure.
- `scene.js` builds procedural architecture, lighting, textures, physical plaques, and exhibit placement.
- `exhibits.js` creates the nine individual animated sculptures. They are artistic previews. The full projects contain the scientific experiments.
- `projects.js` defines titles, descriptions, links, colors, and floor coordinates.
- `observatory.css` styles the room interface and responsive layouts.
- `entry.css` styles the isolated homepage entry.
- `vendor/` contains local Three.js **0.180.0**, OrbitControls, and the upstream MIT license. Only the controls’ import path is changed. Three.js is loaded only on the observatory page.

The sculptures and architecture use code-generated geometry and canvas textures. No remote models or image assets are required. Google Fonts is optional. Serif and monospace system fonts remain available offline.

## Validation

Checked JavaScript syntax, all nine scene constructions and animation updates, finite geometry and matrices, camera framing at desktop and phone sizes, all nine project destinations, proximity interactions, floor and central collisions, mode transitions, and directory access after graphics failure. A DOM/Three.js harness exercises application logic with a stub graphics renderer. This does not validate actual WebGL drawing or browser layout. Browser visual and device checks remain necessary when a browser connection is available.
