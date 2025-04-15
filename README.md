# Motion Observer

**Observe device orientation and motion in a browser-agnostic fashion using the Observer pattern.**

Motion Observer is tiny (~1.8KiB GZipped) zero-dependency library which exposes a `MotionObserver` class, which can be used to observe device orientation and motion events in a browser agnostic way. The observer can report Orientation events (derived from the gyroscope) as euler components, quaternions, and 4d matrices, and it can also report motion events (linear acceleration from the device's accelerometer) as 3D vectors. The observer automatically handles prompting for user permissions if `observe` is called in response to a user-gesture, and will also standardize events between different OSes which have different coordinate systems (iOS).

&nbsp;

## Installation

```bash
npm install motion-observer
```

&nbsp;

## Usage

```javascript
import { MotionObserver, MotionType } from 'motion-observer';
const observer = new MotionObserver();
observer.observe([ MotionType.Orientation, MotionType.Acceleration ]);
observer.on(MotionType.Orientation, ({ detail: { quat } }) => console.log("Device rotation: ", quat));
observer.on(MotionType.Acceleration, ({ detail: { acc } }) => console.log("Device acceleration: ", acc));
```

&nbsp;

## API

&nbsp;

### `MotionObserver`

The primary class for observing device motion and orientation events. It can be created using `new MotionObserver()`, and then manipulated using the following methods, which follow the Observer Pattern seen in Javascript's `ResizeObserver` and `MutationObserver`.

#### `observe(filter?: Iterable<MotionType>): Promise<void>`

Begins observing for motion, either for all possible events if `filter` is unspecified, or just for the events listed in `filter`. On some devices, the user must grant permission to observe motion events. If this has not already been requested by `MotionObserver.requestPermissions`, it will be requested when `observe` is called. The returned promise will resolve if the observer was able to begin observing, or reject if required permissions are denied or there was another issue preventing observation.

#### `unobserve(filter?: Iterable<MotionType>): void`

Stops observing the motion types listed in `filter`, or all motion types if it is left unspecified. When a  motion type is `unobserve`d, event listeners bound to it will no longer fire until it is `observe`d again. This does not removed existing event listeners, which have to be manually removed using `removeEventListener` / `unbind` / `off`.

#### `disconnect(): void`

Completely disconnects the observer, stopping all motion events and removing all event listeners. This is equivalent to calling `unobserve` on all motion types, and then calling `removeEventListener` on all event listeners. This is useful for cleaning up the observer when it is no longer needed, such as when a component is unmounted in React.

#### `addEventListener(event: MotionType, cb: (event: MotionObserverEvent) => void): void`

**Aliases: `bind`, `on`**

Adds an event listener for the specified motion type. The callback will be called with the appropriate `MotionObserverEvent` when an event is available. No events will be fired before `observe` is called, or if the specified `event` type was filtered out.

#### `removeEventListener(event: MotionType, cb: (event: MotionObserverEvent) => void): boolean`

**Aliases: `unbind`, `off`**

Removes an event listener bound to a specified motion type. The callback will be removed from the list of callbacks, and will no longer be called when an event is available. Returns a boolean indicating if the callback was found.

#### `once(event: MotionType, cb: (event: MotionObserverEvent) => void)`

Adds a one-off event listener for the specified motion type. The callback will be called once when an event of the appropriate type is available, then removed from the list of listeners. No events will be fired before `observe` is called, or if the specified `event` type was filtered out.

#### `MotionObserver.requestPermissions(): Promise<void>`

On some devices (iOS), the user must grant permission to observe motion events. This will be requested automatically when `observe` is called, or they can be manually requested using this static function. The prompt will not be shown to the user if this function is not called in response to a user event, which will cause the promise to reject immediately. If the user *manually* denies the permission prompt on iOS, they will need to completely restart their browser app before another request can be made, and all future calls to `requestPermissions` this session will be immediately rejected. On devices which do not require permissions, this function will resolve immediately.

### `MotionType`

An enum representing the valid motion types which can be observed. The following types are available:

#### `MotionType.Orientation` (`"orientation"`)

Observes the orientation of the device using the gyroscope. Listeners listening to this event type will be fired when the device is rotated, and will be provided a `OrientationEvent` object.

#### `MotionType.Acceleration` (`"acceleration"`)

Observes the linear acceleration of the device using the accelerometer. Listeners listening to this event type will be fired when the device is moved, and will be provided a `AccelerationEvent` object.

#### `MotionType.AccelerationInclGravity` (`"accelerationInclGravity"`)

Observes the linear acceleration of the device using the accelerometer, including gravitational acceleration. Listeners listening to this event type will be fired when the device is moved, and will be provided a `AccelerationEvent` object.

&nbsp;

### `OrientationEvent`

A custom event object containing information about a device's orientation. Fired by a `MotionObserver` to all listeners observing the `MotionType.Orientation` event type. Unlike regular `CustomEvent`s, `stopPropagation` *may* be called to cancel event propagation to other listeners.

Contains the following properties in the `detail` property:

- `quat`: `Quaternion`: A quaternion representing the rotation of the device.
- `mat`: `() => Matrix`: A function which can be called to return a row-major rotation matrix representing the rotation of the device.
- `alpha`: `number`: The rotation around the device's z-axis in radians.
- `beta`: `number`: The rotation around the device's x-axis in radians.
- `gamma`: `number`: The rotation around the device's y-axis in radians.
- `absolute`: `boolean`: True if the rotation is relative to the earth's coordinate system, or false if it is arbitrary and relative to the device's starting position. This effectively indicates whether the raw events being processed are `deviceorientation` or `deviceorientationabsolute`. MotionObserver will *always* prioritize absolute readings if the device supports it. Note that even if `absolute` is true, that does not mean the device's coordinate frame is *accurate*. It was regularly be off by 10 degrees or more in testing, and should at best be used as a rough approximation.
- `webkitCompassHeading`: `number`: A number representing the difference between the motion of the device around the z-axis of the world system and north, in radians. Only available on iOS devices. This may drift or diverge from `alpha`, even when `absolute` is `true`.
- `webkitCompassAccuracy`: `number`: The accuracy of `webkitCompassHeading` in radians, as determined by iOS. Usually within 10 degrees.

&nbsp;

### `AccelerationEvent`

A custom event object containing information about a device's linear acceleration, either containing or omitting the Earth's gravitational acceleration. Fired by a `MotionObserver` to all listeners observing the `MotionType.Acceleration` or `MotionType.AccelerationInclGravity` event types. Unlike regular `CustomEvent`s, `stopPropagation` *may* be called to cancel event propagation to other listeners.

> [!IMPORTANT]
> iOS and Android have different coordinate systems for accelerometer readings, with iOS reporting a face-up device's gravitational force as negative 9.8, and Android reporting it as positive. **This library standardizes all measurements regardless of OS to the Android coordinate system**.

> [!CAUTION]
> Please note that accelerometer readings are not appropriate for detecting smooth motion or velocity, as their accuracy varies severely across devices, and even the best of them aren't equipped to accurately report smooth motion. They are best used for detecting sudden changes in motion, such as shaking or tilting the device. Even in best case scenarios, accelerometers often have severe drift and noise, and should be processed through a Kalman filter or similar algorithm to get useful smoothed measurements. That is outside the scope of this library, which just reports the raw device readings.

Contains the following properties in the `detail` property:

- `acc`: `Vector`: A 3D vector representing the linear acceleration of the device. Depending on if this object was provided by a listener on `Acceleration` or `AccelerationInclGravity`, this property may include gravitational acceleration in it. Components are relative to the device's coordinate frame.
- `interval`: `number`: The time interval in which the acceleration was measured.
- `inaccurate`: `boolean`: If true, the acceleration reading was derived in a way that may be less accurate, such as via sensor fusion with the gyroscope to remove gravitational acceleration. If this property is true, expect an increase in drift and inaccuracy, and consider applying a filter to the readings to compensate. May only be true on `Acceleration` events, never `AccelerationInclGravity`.

&nbsp;

### Quaternion

An array of four numbers representing a quaternion. The four components are in the following form: `[ x, y, z, w ]`. Can be spread directly into ThreeJS's `Quaternion` class, e.g.: `new Quaternion(...quat)`.

&nbsp;

### Vector

An array of three numbers representing a 3D vector. The three components are in the following form: `[ x, y, z ]`. Can be spread directly into ThreeJS's `Vector3` class, e.g.: `new Vector3(...vec)`.

&nbsp;

### Matrix

An array of sixteen numbers representing a 4x4 Matrix in row-major order. Can be spread directly into ThreeJS's `Matrix4` class, e.g. `new Matrix4(...mat)`.

&nbsp;

## Developing

Run `npm run dev` to watch the files for changes and build the library. The output will be in the `index.js` file. To build for production, run `npm run build`.

&nbsp;

## Contributing

If you would like to contribute to this library, please open an issue or a pull request. I am happy to accept bug fixes and documentation improvements, however new features will only be considered if they do not substantially increase the bundle size or maintenance complexity. Please make sure to follow the code style and conventions used in the library when contributing.

&nbsp;

**Made by [Auri Collings](https://github.com/Aurailus) with ❤️.**
