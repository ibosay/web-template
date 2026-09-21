# Traffic sign assistant

Reads Austrian speed limits and stop signs from the rear camera of a phone while driving, remembers
the limit in force, compares it with the speed from the GPS, and warns out loud.

Route: `/verkehrszeichen`.

## Why it is built this way

The assistant runs as a web page in the browser of the phone rather than as an app from a store. For
a first version that is the cheaper trade in every direction that matters:

- **No build chain for two platforms.** Change a file, reload the page on the phone, drive. No
  Xcode, no Android Studio, no signing, no review.
- **Everything the assistant needs is in the browser already.** The camera comes from
  `getUserMedia`, the speed from `navigator.geolocation`, the voice from `speechSynthesis`, and the
  screen is kept awake by the Screen Wake Lock API.
- **It stays on the phone.** No picture is uploaded and none is stored, so the assistant also works
  in a valley with no signal.

What it costs: the page has to be open and in the foreground, and the detection runs slower than it
would in native code. Both are acceptable for a phone in a holder, and neither is a dead end — the
page can be wrapped into a real app later, see [Part 3](#part-3-a-real-app).

### Why the detector recognises shapes instead of running a network

The usual answer for reading traffic signs is a small trained network. That is the better detector,
and it is where this should end up — but it needs a model file, and the
[content security policy](../../../server/csp.js) of this app allows neither scripts nor connections
from a foreign CDN. A model would have to be trained, converted, and served from this app first,
which is a project of its own.

So the first version reads the signs from their shape and their colour, which needs no model, no
download and no new dependency, and works offline from the first frame. It is honest about being a
baseline: see [what it cannot do](#what-it-cannot-do).

## How it works

```
camera ─→ frame ─→ detector ─→ stabilizer ─→ assistant ─→ voice
```

1. **`hooks/useCameraStream`** opens the camera on the back of the phone.
2. **`hooks/useFrameDetection`** shrinks every frame to 384×288 and hands it over, eight times a
   second. A sign stays in view for seconds, so looking more often would only cost battery.
3. **`detection/signDetector`** finds the signs in that one frame:
   - red pixels are marked (`detection/imageAnalysis`) and grouped into connected areas,
   - how much of its bounding box an area fills separates the two signs: a red **ring** fills about
     a third of it, a solid red **octagon** about 80%,
   - inside a ring, the bright disc it encloses is searched for, and the number is read out of it
     (`detection/digitRecognition`) by comparing every digit with a reference shape
     (`detection/digitTemplates`),
   - a number that is not a limit posted in Austria is thrown away (`signTypes`).
4. **`logic/detectionStabilizer`** only lets a sign through once it has turned up in three of the
   last six frames. A real sign does; a red jacket on a cyclist does not.
5. **`logic/assistantState`** keeps the limit in force and decides what is worth saying: a new
   limit, a stop sign, or a speed that has stayed over the limit for a few seconds.
6. **`hooks/useSpeech`** says it, in the language of the app.

Steps 3 to 5 are plain functions with no browser in them, which is where the tests are.

## The files

```
TrafficSignAssistPage/
├── TrafficSignAssistPage.js      # the page: wires the parts together
├── signTypes.js                  # the signs it knows, and the limits that exist in Austria
├── detection/
│   ├── imageAnalysis.js          # red mask, connected areas, region measurements
│   ├── signDetector.js           # ring or octagon, and what is inside it
│   ├── digitRecognition.js       # reads the number off the disc
│   ├── digitTemplates.js         # reference shapes of the digits 0-9
│   └── syntheticSigns.js         # draws signs, for the tests
├── logic/
│   ├── detectionStabilizer.js    # several frames have to agree
│   └── assistantState.js         # the limit in force, and when to speak
├── hooks/                        # camera, GPS, voice, screen, frame loop
├── StartScreen/                  # before the drive
└── DriveScreen/                  # during the drive
```

## Trying it on a phone

The camera and the GPS are only handed out in a **secure context**, so `http://192.168.x.x:3000`
will not work — the browser refuses the camera without a word of explanation. Use one of these:

```sh
# a certificate the dev server makes up itself; the phone will warn once, accept it
HTTPS=true yarn dev

# or your own certificate
HTTPS=true SSL_CRT_FILE=cert.pem SSL_KEY_FILE=key.pem yarn dev
```

A tunnel that gives you a public `https://` address also works, as does deploying the app.

Then open `/verkehrszeichen`, tap **start**, and allow the camera and the location. Tapping **show
detection** draws a box around everything the detector found, with what it read in it. That view is
the tool for judging whether the detector is doing its job: park at the side of a road with a sign
in view and watch what it makes of it.

## Tuning it

Every threshold sits in one of three objects and none of them is buried in the algorithm:

- `DEFAULT_ANALYSIS_OPTIONS` (`detection/imageAnalysis.js`) — what counts as sign red, and the
  smallest area worth looking at.
- `DEFAULT_DIGIT_OPTIONS` (`detection/digitRecognition.js`) — where black turns into white, and how
  closely a digit has to match its reference shape.
- `DEFAULT_DETECTOR_OPTIONS` (`detection/signDetector.js`) — ring against octagon, and the checks on
  what is inside them.

The rules for speaking are separate again, in `DEFAULT_RULE_OPTIONS` (`logic/assistantState.js`):
tolerance, how long a speed has to stay too high, and how long before a warning is repeated.

If you change a threshold, run the tests: `npx jest src/containers/TrafficSignAssistPage`.

## What it cannot do

Worth knowing before trusting it with anything:

- **It misses signs and misreads some.** The shape detector wants a reasonably clean sign at
  reasonable light. A dirty sign, dusk, rain, low sun, or a sign still far away will be missed.
- **It cannot read the signs that end a limit.** "Ende der Geschwindigkeitsbeschränkung", a motorway
  exit, or a limit that applies to a side road are all invisible to it. Instead, a limit it has not
  seen again for eight minutes is forgotten, which is the cautious way round: forgetting means no
  warning, keeping would mean a wrong one.
- **It does not know about conditional limits** — a limit that only holds when wet, at night, or for
  lorries, and none of the extra panels under a sign.
- **A solid red octagon and a solid red disc look nearly alike to it.** They are told apart by the
  white letters a stop sign has, which is a weaker cue than a shape.
- **It needs the page in the foreground.** Switch apps or let the screen lock, and the camera stops.
- **It is not a speed camera warner and not a legal record.** What counts is at the side of the
  road.

## Part 2: a trained model

The detector sits behind `createDetector` in `detection/signDetector.js`, which is an object with a
`prepare` and a `detect`. A model based version implements the same two and nothing else in the app
changes:

```js
export const createDetector = () => ({
  name: 'yolo',
  prepare: () => loadModel('/static/models/signs.json'),
  detect: imageData => runModel(imageData), // same `{ type, limitKmh, confidence, box }`
});
```

A sensible order of work:

1. **Collect footage.** Drive with the page open and record, or film with a mounted phone. A few
   hundred frames of Austrian roads in different light is worth more than any public dataset.
2. **Start from a public dataset.** Austrian signs follow the Vienna Convention, so the German GTSRB
   and GTSDB sets and the Mapillary Traffic Sign Dataset transfer almost directly. Label your own
   footage on top of them.
3. **Train a small detector**, e.g. a YOLO at the smallest size, on the classes you need — one per
   limit plus stop.
4. **Convert it** to TensorFlow.js or ONNX Runtime Web, and put it under `public/static/`. Serving
   it from this app keeps it inside the content security policy; a CDN does not.
5. **Swap in the detector** as above, and keep the shape detector as the fallback for when the model
   fails to load.

The stabilizer, the rules and the voice all stay as they are — they only ever see
`{ type, limitKmh, confidence, box }`.

Signs to add after that, in the order they pay off: end of a speed limit, give way, no entry,
overtaking bans, and the extra panels under a sign.

## Part 3: a real app

Wrapping the page with [Capacitor](https://capacitorjs.com/) gives an app for both stores from this
same code, and with it the things a web page cannot have: the camera while the screen is off, a
proper foreground service, and a start from the home screen. Worth doing once the detection is good
enough to be worth carrying around — not before.
