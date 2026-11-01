# MissionSim EDU

Educational CubeSat mission design and playback using React, TypeScript, Cesium and satellite.js.

## Thermal model and physical panel limits

Build → Thermal edits spacecraft.thermal: massKg, specificHeatJkgK,
initialTemperatureC, body absorptivity/emissivity, and panelAbsorptivity/
panelEmissivity. New 3U missions start at 4 kg, 900 J/kg/K and 20 °C, with
body α/ε = 0.35/0.80 and solar-cell α/ε = 0.90/0.85. These are editable
teaching assumptions for a mixed-surface satellite, not a material specification.
Size-based default masses are 1.33, 2.66, 4 and 8 kg for 1U, 2U, 3U and 6U.
Reset thermal defaults explicitly restores the selected size's defaults. Size
changes preserve custom masses and update a mass still matching its old default.

The single-node model follows m cp dT/dt = absorbed sunlight + Earth infrared +
albedo + internal dissipation − emitted infrared, using kelvin internally.
See [NASA Thermal Control](https://www.nasa.gov/smallsat-institute/sst-soa/thermal-control/)
for the heat-balance framework. The 900 J/kg/K effective heat capacity is an
aluminum-like bulk approximation; the real assembly contains other materials.

src/sim/thermal.ts calculates exposed body area after subtracting body-mounted
cells, adds deployed panel fronts and backs, and uses attitude-dependent projected
areas. Earth IR is 237 W/m²; albedo is 0.30 with a simplified view factor
(Earth radius / orbital radius)² times positive surface/Earth cosine, and a
Sun/Earth-angle illuminated fraction. These are approximate environmental inputs.
Direct sunlight is removed in eclipse; Earth IR remains. No shadowing is modelled.
All deployed panels are assumed perfectly thermally coupled to the bus.

Converted electrical solar power is subtracted from absorbed sunlight. Internal
heat equals generated electrical power minus the change in stored battery energy
per second: this includes served loads, battery losses and locally shunted surplus.
Unmet demand generates no heat. All radio input is treated as heat (RF export is
omitted). There is no temperature feedback, heater, thermal protection or separate
battery temperature. RK4 integrates radiation within the existing resource steps,
with additional stability substeps for small thermal masses. Snapshot states store
temperature and heat-flow terms; Analyze → Graphs adds temperature with eclipse
shading and hover values, and Simulate displays current temperature.

New 3U missions use 0.024 m² solar cells on the 0.030 m² +X face. All panels are
limited to 80% of their corresponding body face: body-mounted cells share one
budget per face; each deployable leaf has its own 80% limit. More deployable
leaves can form larger arrays. Custom normals use their closest signed body axis
for this authoring limit. Body size, mounting and direction changes shrink panels
to fit; area edits and JSON imports are validated and never silently corrected.
Older oversized definitions show a Fit solar panels action, which explicitly
resizes panels in list order. Files without thermal fields receive size-based
defaults in the compiled snapshot. Solar-cell absorptivity must be at least the
electrical conversion efficiency to preserve the absorbed-energy budget.

## Mission planning and operating modes

Build → Mission configures mission name, start epoch, orbit count or hours, sampling
step, default mode, nominal bus power, safe-mode power and additional payload power.
These controls edit the shared JSON; nominal bus and payload loads remain the same
fields used by the Satellite sheet. The optional missionPlan section stores
defaultMode, safeLoadW and repeatEachOrbit. Older files default to nominal, 2 W safe
load and one-off scheduling. New missions default to repeating schedules.

operations contains half-open intervals [startSec,endSec), either relative to mission
start or repeated from the start of each orbit. Mode choices are nominal, safe,
imaging and planned downlink. Legacy idle means nominal. Unscheduled time uses the
default mode. Intervals cannot overlap or exceed their applicable schedule window.
The duty-cycle preset explicitly replaces the schedule with one imaging interval.
Its remaining time uses the default mode. The preview shows mode blocks and a step
graph of demand, with exact planned payload duration and duty percentage.

Nominal and planned downlink draw the configured bus load; imaging adds
the payload load; safe mode uses safeLoadW with payload and radio off.
missionPlan.downlinkStrategy selects automatic transmission during available
ground contacts or disabled downlink. Automatic transmission can run alongside
imaging and adds spacecraft.radio.loadW only while queued data is transmitted.
The operationAt module records baseline scheduled loads; the resource simulation
adds radio demand to SatelliteState.totalLoadW. Simulate displays mode and demand.
Imaging mode does not override the separately selected attitude strategy.

## Battery, camera storage and downlink

Satellite settings include battery capacity, initial charge, charge/discharge
efficiencies and bus-side power limits. Solar generation supplies loads first;
surplus charges the battery and deficits discharge it. Battery energy is clamped
between zero and capacity. Unserved electrical demand is recorded. Imaging and
transmission pause during a power shortage; planned modes continue, without an
automatic safe-mode controller. Playback and scrubbing read precomputed states.

The camera presets are uncompressed 100×100 16-bit monochrome (20,000 bytes)
and 1000×1000 24-bit RGB (3,000,000 bytes). One frame completes per configured
captureIntervalSec of continuous, powered imaging. Leaving imaging resets a
partial exposure. Storage starts empty; a complete image that cannot fit is
dropped, without overwriting existing images. Images are counted as attempted
captures, with dropped images reported separately. Image contents are not rendered.

spacecraft.storage.capacityMB uses decimal MB (1,000,000 bytes).
spacecraft.radio.downlinkMbps uses decimal megabits/second, converted to bytes
for transfer. One transmitter serves the union of above-mask station contacts;
overlapping contacts never multiply throughput. The radio is idle when storage is
empty. Radio energy is proportional to time transmitting, including partial
intervals that empty storage. Geometry determines availability; compression,
packet overhead, RF link budgets and acknowledgements are omitted.

Resource integration uses steps of at most five seconds, split at scheduled mode
changes, interpolated contact boundaries and frame completions. Solar input is
interpolated from recorded samples; eclipse/contact accuracy remains limited by
the selected output sampling step. SatelliteState records battery Wh/SoC, stored,
captured, downloaded and dropped bytes, image counts, radio activity and unmet Wh.
Analyze → Graphs displays battery level and memory usage alongside existing graphs,
with eclipse/download shading, capacity references and shared cursor inspection.

Optional version-1 fields remain backward compatible: battery defaults to 80%
initial charge, 90% charge/95% discharge efficiency, 15 W charge/25 W discharge;
radio defaults to 0.1 Mbps and 5 W; storage to 64 MB; camera to monochrome with a
60-second interval; downlink defaults to automatic. Compiled snapshots resolve
these defaults explicitly. The JSON editor and forms edit the same definition.

## Interface and learning flow

The sticky header contains the three learning stages, stage-specific sheets and
the primary action in the same right-hand area: Compile & Simulate, Start/Stop,
or Replay run. Main tabs and sheets align left, and the MissionSim EDU label is on
the right. Build sheets and validation keep ownership of their controls via
header portals; moving a control does not introduce a second configuration source.
Navigation returns to the top of the selected sheet.

Every simulation camera shares one clock and scrubber below its visualization, with elapsed time,
run duration, UTC, playback status and speed controls. The duplicate bottom Cesium
timeline is removed. Changing views preserves time. Leaving Simulate pauses the
clock and suspends its render loop; returning restores the same time and view.
Replay run explicitly loads the recorded configuration from its beginning.

Build keeps the preview beside the main configuration fields on desktop and stacks
them on small screens. Drafts and selected sheets survive stage changes. Analyze
has Graphs, Runs and Run definition sheets; all existing graphs remain together on
Graphs. Run definition is a read-only snapshot, separate from the editable Build
configuration. Primary actions are disabled when no run is available or input
validation fails. Spacing and form controls are compact and keyboard focus is visible.

## Geographic orientation, payload faces and contact cues

Orbit design now projects schematic continent outlines, the equator and Greenwich
in an Earth-fixed view at the mission start epoch. RAAN still occupies its original
TLE field and is measured from the inertial equinox; its geographic ascending-node
longitude is RAAN minus Greenwich sidereal angle. The preview applies this rotation,
shows the ascending node when on the near side, and offers a viewing-longitude
slider. An exact RAAN number input complements the slider; full turns wrap to zero.
Equatorial orbits have no uniquely defined ascending node. Coastlines are deliberately
simplified teaching aids, not map data for precise targeting.

spacecraft.payload.side selects +X, -X, +Y, -Y, +Z or -Z (legacy default +Z).
Both the model aperture and Payload camera follow this face using the recorded body
orientation. Nadir pointing now aligns the selected payload face with Earth and its
local camera-up direction along-track. Selecting a different face changes the commanded
body orientation under nadir pointing. Sun pointing remains +X toward Sun. Payload
view uses the recorded boresight directly, with no independent camera tilt.

Global 2D and oblique views initially fit the full world rectangle. Active contacts
are blue straight lines between every available station and the satellite in all
views, independently of the ground-track toggle. Visibility uses current interpolated
position and each station's elevation mask; normal camera/frustum occlusion still
applies. These are geometric contact indicators, not simulated radio transmissions.

Both station analysis charts include horizontal horizon and mask lines. On the
distance chart these refer to a purple elevation overlay and the right-hand degree
axis, while range retains its left-hand km axis. A single fixed distance threshold
would be misleading for an orbit with changing altitude. Green contact shading
remains the shared timing reference on both graphs.

## Conceptual spacecraft visualization

The Satellite sheet includes a rotatable box-and-panel preview. CubeSat sizes use
approximate body dimensions: 1U 10×10×10 cm, 2U 10×10×20 cm, 3U 10×10×30 cm,
and 6U 20×10×30 cm. Rails, solar cell grids, coloured body-face markings and a configurable
camera aperture make orientation recognizable. Body-mounted panel drawings are
fitted to the available face; deployable panels extend outward. These conceptual
dimensions are not a mechanical design or a change to configured generating area.

src/mission/geometry.ts supplies both the SVG assembly preview and self-contained
procedural glTF used in Orbital and Satellite Inertial views. No downloaded model
or additional graphics library is needed. The model follows the recorded attitude;
labelled body axes identify +X/Sun or +Z/Earth for the chosen strategy. Its apparent
size is exaggerated for teaching, without altering positions, power or propagation.
Unlit materials keep the spacecraft visible in eclipse. Global/Operator retain a
small marker, and Payload hides the external model to keep the camera unobstructed.

Orbital view uses a satellite-centred frame: +X along-track, +Z radially outward,
and +Y completing a right-handed basis. Along-track is calculated from interpolated
positions with Earth's rotation removed from the fixed-frame derivative. The
camera stays at a constant local offset (-15 km, -5 km, +6 km), independent of
spacecraft attitude. Its field of view is fixed. Body geometry uses one constant
exaggerated scale per run (assembly bounding radius 1.8 km), also shared by the
body-axis arrows. No scale calculation depends on camera distance or playback
speed. Frame updates run in Cesium preUpdate before scene primitives/rendering;
scrubbing and endpoint evaluation use the selected mission time directly.

## Attitude and solar generation

The Satellite sheet selects spacecraft.attitude.strategy: sun-pointing or
nadir-pointing. Older version-1 definitions without attitude default to
sun-pointing; compiled run snapshots explicitly include the resolved strategy.

Sun pointing aims body +X at the Sun. Body +Z is the orbital angular-momentum
direction projected perpendicular to the Sun; +Y completes a right-handed frame.
Nadir pointing aims the selected payload-face normal at Earth's centre and its
local camera-up direction along the velocity component perpendicular to nadir. These ideal commanded attitudes
have no slew-rate limits or attitude-control dynamics. A deterministic transverse
axis handles degenerate alignment.

Each recorded SatelliteState includes time, TEME position/velocity, body axes in
TEME, Sun direction in body coordinates and sunlight state. CZML orientations are
converted to Earth-fixed quaternions with continuous signs. Payload boresight is
the selected payload face, without a viewing offset, so Sun pointing need not look at Earth.

For each panel, generation is 1361 W/m² times area times efficiency times the
positive panel-normal/Sun-direction dot product. Eclipse forces all panels to
zero. Panels are one-sided, deployables are assumed deployed, and self-shadowing,
losses, albedo and temperature-dependent efficiency are omitted. This is generated
power; the separate resource model integrates it against electrical demand to calculate battery charge.

Analyze selects a recorded run and displays all panel curves plus a dashed total
on one graph, with eclipse shading and cursor inspection. Peak power and total
generated Wh are derived from that run. Energy uses trapezoidal integration over
actual sample intervals; eclipse transition accuracy is limited by the time step.

Analyze also has ground-station visibility and slant-range graphs sharing the same
time scale and inspection cursor. A station selector updates both charts. Elevation
shows horizon and antenna-mask references; green shading marks above-mask contact
windows. Range is the direct satellite-to-station distance in km, including blocked
geometry shown in grey. Only above-mask intervals are highlighted as available.
Summaries show contact-window count, total available minutes, peak elevation and
closest sampled range during contact. Runs that start/end during contact include
partial windows. No-contact and no-station cases are explicit.

src/sim/contact.ts derives contact windows from stored look angles, interpolating
mask crossings between samples and never bridging missing data. These time/range
inputs drive the simplified constant-rate downlink model; an RF link budget remains a future extension.

## Run

Run npm.cmd install, then npm.cmd run dev. Open the localhost URL printed by Vite;
opening index.html directly will not run the application. Bundled Earth imagery needs no ion token.

## Shared mission definition

src/mission/definition.ts is the versioned, JSON-serializable input contract.
createDefaultMission() supplies the complete example shown in the Build JSON editor.
App owns the editor draft, so edits survive switching tabs, including incomplete JSON.
Drafts and run history are in memory only and reset on page reload.

Build has Mission, Satellite, Orbit, Ground Stations and Configuration JSON sheets. Satellite
offers body size, battery/base/payload loads, and adding/removing solar panels with
area, efficiency, mounting and body-axis facing direction. Ground Stations offers
multiple stations with name, coordinates, altitude and elevation mask. Form fields
apply on blur or Enter and use the shared definition's validation. Invalid fields
block compilation until corrected or their sheet is left (discarding uncommitted
field drafts). Valid form changes update JSON while preserving all other settings.
Custom panel normals entered in JSON remain unchanged unless a preset is selected.
Malformed manual JSON remains editable, with forms unavailable until repaired.

The Orbit sheet provides perigee, apogee and inclination sliders, plus optional
RAAN, argument of perigee and starting-phase controls. An oblique Earth/orbit
diagram shows plane orientation and the starting satellite position; an expandable
in-plane diagram shows the ellipse with Earth at one focus. Period and eccentricity
readouts update immediately. Perigee/apogee constrain one another to preserve a
valid ellipse. The preview uses approximate mean-element geometry, not propagated
osculating geometry.

Slider values are derived from the existing TLE, with no duplicate saved orbit
configuration. Edits generate fixed-width TLE lines with checksums, using the
mission start as their epoch and preserving spacecraft/station settings. These are
educational TLEs, not fitted operational elements. Epoch authoring supports
1957–2056 (the TLE two-digit year convention); manual TLE editing is still available.

The definition groups:

- schemaVersion and name: format version and mission name.
- orbit: type (tle), line1 and line2. Preserve the fixed-width TLE spaces.
- simulation: startIso in UTC, stepSec, and duration: either
  { "type": "orbits", "count": 3 } or { "type": "seconds", "seconds": 21600 }.
- spacecraft.body: size (1U, 2U, 3U or 6U).
- spacecraft.power: solarPanels, batteryCapacityWh and baseLoadW. Each panel has an
  ID, mounting, areaM2, efficiency and a normalBody unit vector. Body axes form a
  right-handed frame related to the orbit and Sun by the selected attitude model.
- spacecraft.payload: camera type, loadW and optional side (default +Z).
- groundStations: unique IDs, name, lat/lng in degrees, optional altMeters and maskDeg.
- operations: startSec/endSec mode intervals, one-off or repeated each orbit per missionPlan.

Units are explicit in field names; efficiencies are fractions from 0 to 1.
Unsupported schema versions are rejected. Future contract changes can add migrations.
Battery, camera, storage, radio and thermal properties are typed subsystems.

parseMissionDefinition() validates external JSON. compileScenario() also validates
and snapshots the definition as CompiledScenario.mission. There is no separate
flattened design structure. Compiler and station cameras consume the same contract.

Implemented: TLE propagation, orbit-count/time durations, approximate eclipse
telemetry, stations, ground track and star-fixed global playback. The final position
sample reaches the exact mission end. The default start matches the example TLE
epoch, giving repeatable orbit and eclipse results.

Panel configuration and attitude drive solar generation. Scheduled modes and loads
drive battery, storage and single-node thermal simulation. Station access uses geometric look angles.
TLE validation checks structure, not checksums or real-world freshness.

## Checks

- npm.cmd run typecheck
- npm.cmd test
- npm.cmd run build

Tests cover JSON round trips, validation, isolated run snapshots, repeatability,
orbit counts, exact final samples and sample limits. No new runtime dependencies.

Cesium assets are served/copied under /cesium. The satellite is currently rendered as a yellow marker, without an external model dependency.

## Ground track

The turquoise track shows the preceding orbit as a solid line and the upcoming
two-thirds of an orbit as a dashed line, bounded by the mission interval. A moving turquoise point
marks the satellite's projection on Earth; a dotted line connects it to the yellow
satellite marker. Yellow also identifies the recent path at orbital altitude.
The controls above the globe independently hide the ground track and orbital path.
Tracks follow the playback clock, including rewind. The surface trace
is lifted 500 metres for display, with smooth interpolation to avoid flicker and
straight segments disappearing beneath the globe. This offset is visual only and
does not change orbit propagation. Future tracks are predictions, not downlinks.

## Playback, cameras and station visibility

Runs load stopped. Start resumes (or restarts at the end), Stop pauses at the
current time, and Reset pauses at mission start. The shared slider below the visualization scrubs the simulation clock. Playback stops at mission end; speed does not alter results.

Global supports star-fixed 3D, Earth-fixed 2D, and Earth-fixed oblique maps.
Other views always use 3D. Orbital uses a chase camera with smooth position
interpolation and a central velocity estimate, including at mission boundaries.
Satellite Inertial uses a TEME star frame centred on the moving spacecraft.
Payload follows the recorded selected-face boresight with a fixed 35 degree field of
view. No independent camera tilt is applied; camera data volume is simulated without rendering images.
Camera updates run before rendering; manual navigation is available in Global.

Operator uses the selected station's geodetic horizon. It follows a satellite
above the horizon and looks north while it is below the horizon. The side polar
plot shows north-up/clockwise azimuth, elevation rings, the antenna mask, predicted
above-horizon passes and an exact live look-angle marker. It distinguishes below
horizon, below mask and above mask. Station access telemetry uses the same geometry;
data transmission uses a constant configured rate without an RF link budget. The default one-orbit
Helsinki run has no horizon pass; try 16 orbits to see several passes.

Nadir pointing is regression-tested for every payload face, checking both stored
body axes and rendered CZML quaternions at multiple mission times. The predicted
ground-track lead is limited to 2/3 of the orbit period; recorded trajectories and
simulation durations are unchanged. Recompile existing runs to use the new attitude.

## Scrolling and Operator direction cues

The workspace owns its vertical scrolling below the fixed header. All stages,
including the complete Analyze graph stack, scroll in this content area. Sheet
changes reset that content scroll position, while simulation time is preserved.

Operator tracks above-mask satellites by default from a fixed station position.
Outside contact it faces the North horizon (azimuth zero), consistent with the
North-up antenna polar plot. Ground-level N/E/S/W labels and compass rays surround
the selected station; only directions inside the camera field of view are visible.
The current heading is shown beside the optional Track satellite checkbox. When
tracking is enabled the camera pans/tilts toward above-mask satellites and otherwise
returns North. Compass entities are hidden in other views.

## Inertial orbit outline

The yellow altitude curve is a stable closed ellipse from the TLE mean elements,
with Earth at a focus. Its vertices keep a fixed eccentric-anomaly spacing and
shape throughout a run. Only smooth secular RAAN and argument-of-perigee rotation
(from satellite.js initialization rates) changes with time. This prevents noise
from interpolated velocities and near-circular perigee flips from vibrating the
line. Mean motion and eccentricity define the fixed shape, matching Orbit design.
The satellite still uses the full SGP4 trajectory, so a small separation from the
teaching outline is expected; drag and short-period shape oscillations are omitted
from the outline. It is not an exact instantaneous orbit or future prediction.
Every vertex uses the SAME current mission-time TEME-to-Earth-fixed rotation.
Rewind is deterministic, with no playback-speed-dependent smoothing or lag.
The Orbit at altitude toggle controls this outline in every view. Turquoise tracks
retain their Earth-fixed history and 2/3-orbit prediction.