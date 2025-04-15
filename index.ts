
/*********************************/
/** Basic Math Type Definitions **/
/*********************************/

// Represents a Quaternion in xyzw order.
export type Quaternion = [ x: number, y: number, z: number, w: number ];
// Represents a 3D Vector.
export type Vector = [ x: number, y: number, z: number ];
// Represents a row-major 4x4 matrix.
export type Matrix = [ 
	r1c1: number, r1c2: number, r1c3: number, r1c4: number,
	r2c1: number, r2c2: number, r2c3: number, r2c4: number,
	r3c1: number, r3c2: number, r3c3: number, r3c4: number,
	r4c1: number, r4c2: number, r4c3: number, r4c4: number,
];

/*********************************/
/*** Motion Observer Type Defs ***/
/*********************************/

/** Represents a type of motion the MotionObserver can listen to. */
export enum MotionType {
	/** Orientation of the device. */
	Orientation = "orientation",
	/** Motion of the device including acceleration due to gravity relative to the device's orientation. */
	AccelerationInclGravity = "accelerationInclGravity",
	/** Motion of the device excluding the influence of gravity relative to the device's orientation. */
	Acceleration = "acceleration"
}

export type AccelerationEvent = CustomEvent<{
	/** The acceleration vector for the specified interval. */
	acc: Vector;
	/** The time interval at which this acceleration was measured. */
	interval: number;
	/** This value has been derived in a way that may be less accurate, i.e. through sensor fusion. */
	inaccurate: boolean;
}>

export type OrientationEvent = CustomEvent<{
	quat: Quaternion;
	mat: () => Matrix;
	alpha: number;
	beta: number;
	gamma: number;
	absolute: boolean;
	webkitCompassHeading?: number;
	webkitCompassAccuracy?: number;
}>

export type MotionObserverEvent = AccelerationEvent | OrientationEvent;

type MotionObserverEvents = {
	orientation: OrientationEvent,
	acceleration: AccelerationEvent,
	accelerationInclGravity: AccelerationEvent
}

enum NativeEventType {
	Orientation = "deviceorientation",
	OrientationAbsolute = "deviceorientationabsolute",
	Motion = "devicemotion"
}

/*********************************/
/*** iOS Type Inference Helpers **/
/*********************************/

type IOSPermissionGated = { requestPermission: () => Promise<"granted" | "denied">; }

const isIOSPermissionGated = (e: unknown): e is IOSPermissionGated =>
	!!(e && typeof e === "function" && "requestPermission" in e);

/*********************************/
/*********** Constants ***********/
/*********************************/

/** Coefficient to multiply degree measurements by to convert to radians. */
const DEG_TO_RAD = Math.PI / 180;
/** Constant of gravity. */
const GRAVITY = 9.80665;
/** Maximum number of ms to wait for more precise events before determining that they are unsupported. */
const MEASUREMENT_EPSILON = 20;
/** iOS has reversed acceleration values compared to Android, so we need to invert them if we're on iOS. */
const IS_IOS = isIOSPermissionGated(DeviceOrientationEvent);

/*********************************/
/***** Math Helper Functions *****/
/*********************************/

/** Subtracts vector `b` from `a`, returning a new Vector. */
const vecSub = ([ aX, aY, aZ ]: Vector, [ bX, bY, bZ ]: Vector): Vector =>
	[ aX - bX, aY - bY, aZ - bZ ];

/** Applies a Quaternion rotation to the provided Vector, returning a new Vector. */
const vecApplyQuat = ([ vX, vY, vZ ]: Vector, [ qX, qY, qZ, qW ]: Quaternion): Vector => {
	const tX = 2 * (qY * vZ - qZ * vY);
	const tY = 2 * (qZ * vX - qX * vZ);
	const tZ = 2 * (qX * vY - qY * vX);

	return [
		vX + qW * tX + qY * tZ - qZ * tY,
		vY + qW * tY + qZ * tX - qX * tZ,
		vZ + qW * tZ + qX * tY - qY * tX
	];
}

/** Converts a euler to a quaternion, processing its properties in YXZ order. */
const quatFromEulerYXZ = ([ x, y, z ]: Vector): Quaternion => {
	// Derived from ThreeJS's `Quaternion.setFromEuler`.
	const c1 = Math.cos(x / 2);
	const c2 = Math.cos(y / 2);
	const c3 = Math.cos(z / 2);

	const s1 = Math.sin(x / 2);
	const s2 = Math.sin(y / 2);
	const s3 = Math.sin(z / 2);

	return [
		s1 * c2 * c3 + c1 * s2 * s3,
		c1 * s2 * c3 - s1 * c2 * s3,
		c1 * c2 * s3 - s1 * s2 * c3,
		c1 * c2 * c3 + s1 * s2 * s3
	];
}

/** Multiplies two quaternions, returning a new quaternion. */
const quatMultiply = (a: Quaternion, b: Quaternion): Quaternion => {
	// Derived from ThreeJS's `Quaternion.multiplyQuaternions`.
	const qax = a[0], qay = a[1], qaz = a[2], qaw = a[3];
	const qbx = b[0], qby = b[1], qbz = b[2], qbw = b[3];

	return [
		qax * qbw + qaw * qbx + qay * qbz - qaz * qby,
		qay * qbw + qaw * qby + qaz * qbx - qax * qbz,
		qaz * qbw + qaw * qbz + qax * qby - qay * qbx,
		qaw * qbw - qax * qbx - qay * qby - qaz * qbz
	];
}

/** Converts a `deviceorientationevent`'s `alpha`, `beta`, and `gamma` properties to a quaternion. */
const orientationToQuat = (alpha: number, beta: number, gamma: number) =>
	// Derived from https://gist.github.com/kopiro/86aac4eb19ac29ae62c950ad2106a10e
	// 'ZXY' is the device's axis order, but when converting it into a quat we have to invert to YXZ.
	// Then, we need to multiply by a quat because the camera looks out the back of the device, not the top.
	quatMultiply(quatFromEulerYXZ([ beta, alpha, -gamma ]), [ -Math.sqrt(0.5), 0, 0, Math.sqrt(0.5) ]);

/** Creates a 4x4 row-major matrix from a Quaternion. */
const matFromQuat = ([ x, y, z, w ]: Quaternion): Matrix => {
	// Derived from ThreeJS's `Matrix4.compose`.
	const x2 = x + x, y2 = y + y, z2 = z + z;
	const xx = x * x2, xy = x * y2, xz = x * z2;
	const yy = y * y2, yz = y * z2, zz = z * z2;
	const wx = w * x2, wy = w * y2, wz = w * z2;
	return [
		1 - (yy + zz), xy - wz, xz + wy, 0,
		xy + wz, 1 - (xx + zz), yz - wx, 0,
		xz - wy, yz + wx, 1 - (xx + yy), 0,
		0, 0, 0, 1,
	];
}

/*********************************/
/** Event Creation and Dispatch **/
/*********************************/

/*
 * In some browsers, `cancelBubble` is set on an event when `stopPropagation` is called, which can then be read
 * to determine if we should stop firing our our custom events. However this property is technically deprecated,
 * and may eventually be removed in browsers that do support it. We still need the property though as it's the
 * only way to know if we should stop emitting a custom event from the Motion Observer, so this IIFE checks
 * if the behavior still works on the current browser, and if not `createEvent` polyfills it.
 */
const POLYFILL_CANCEL_BUBBLE = (() => {
	const ev = new CustomEvent("");
	ev.stopImmediatePropagation();
	return !ev.cancelBubble;
})();

/** Create a Custom Event with the detail property provided, with functional `stopPropagation` logic. */
const createEvent = <T>(name: string, detail: T) => {
	const event = new CustomEvent<T>(name, { detail, cancelable: true });
	if (POLYFILL_CANCEL_BUBBLE) {
		event.stopPropagation = () => {
			CustomEvent.prototype.stopPropagation.call(event);
			event.cancelBubble = true;
		};
		event.stopImmediatePropagation = () => {
			CustomEvent.prototype.stopImmediatePropagation.call(event);
			event.cancelBubble = true;
		};
	}
	return event;
};

const orientationEventFromDevice = (e: DeviceOrientationEvent): OrientationEvent => {
	const alpha = (e.alpha ?? 0) * DEG_TO_RAD;
	const beta = (e.beta ?? 0) * DEG_TO_RAD;
	const gamma = (e.gamma ?? 0) * DEG_TO_RAD; 
	const quat = orientationToQuat(alpha, beta, gamma);
	return createEvent<OrientationEvent["detail"]>("orientation", {
		alpha,
		beta,
		gamma,
		quat,
		mat: () => matFromQuat(quat),
		absolute: e.absolute,
		...("webkitCompassHeading" in e) ? { 
			webkitCompassHeading: (e as any).webkitCompassHeading * DEG_TO_RAD,
			webkitCompassAccuracy: ((e as any).webkitCompassAccuracy ?? 0) * DEG_TO_RAD
		} : {},
	});
}

const accelerationEventFromDevice = (e: DeviceMotionEvent): AccelerationEvent =>
	createEvent<AccelerationEvent["detail"]>("acceleration", {
		acc: [ 
			(e.acceleration?.x ?? 0) * (IS_IOS ? -1 : 1), 
			(e.acceleration?.y ?? 0) * (IS_IOS ? -1 : 1), 
			(e.acceleration?.z ?? 0) * (IS_IOS ? -1 : 1) 
		],
		interval: e.interval,
		inaccurate: false,
	});

const accelerationInclGravityEventFromDevice = (e: DeviceMotionEvent): AccelerationEvent =>
	createEvent<AccelerationEvent["detail"]>("accelerationInclGravity", {
		acc: [
			(e.accelerationIncludingGravity?.x ?? 0) * (IS_IOS ? -1 : 1), 
			(e.accelerationIncludingGravity?.y ?? GRAVITY) * (IS_IOS ? -1 : 1),
			(e.accelerationIncludingGravity?.z ?? 0) * (IS_IOS ? -1 : 1)
		],
		interval: e.interval,
		inaccurate: false
	});

const accelerationEventFromAccInclGravityEventAndOrientationQuat = (e: AccelerationEvent, q: Quaternion) =>
	createEvent<AccelerationEvent["detail"]>("acceleration", {
		acc: vecSub(e.detail.acc, vecApplyQuat([0, -GRAVITY, 0], q)),
		interval: e.detail.interval,
		inaccurate: true
	});

/*********************************/
/******** Motion Observer ********/
/*********************************/

export class MotionObserver {
	readonly #observed = new Set<MotionType>();

	#hasAbsoluteOrientation: number | boolean | null = null;
	#hasAccelerationWithoutGravity: number | boolean | null = null;
	#lastOrientationQuat: Quaternion | null = null;

	readonly #callbacks = new Map<MotionType, Set<(event: MotionObserverEvent) => void>>(
		Object.values(MotionType).map(name => ([ name, new Set() ])));
	readonly #onceCallbacks = new Map<MotionType, Set<(event: MotionObserverEvent) => void>>(
		Object.values(MotionType).map(name => ([ name, new Set() ])));

	/** 
	 * Requests permission to use device sensors on devices which require user prompting (iOS).
	 * If on iOS, must be triggered in response to a user gesture, on Android it's currently (2025) unnecessary.
	 * On iOS, this must be prompted for each app session, permissions are not saved. If the user denies,
	 * the promise will reject and their app must be completely restarted before the OS will prompt them again.
	 * Calling `observe` will automatically call this function if permissions haven't already been granted,
	 * this is just separately callable if it's desirable to prompt for permissions before starting monitoring.
	 */
	static async requestPermissions(): Promise<void> {
		await Promise.all([
			isIOSPermissionGated(DeviceOrientationEvent) ? (DeviceOrientationEvent.requestPermission()
				.then(v => (v === "granted") ? Promise.resolve() : Promise.reject())) : Promise.resolve(),
			isIOSPermissionGated(DeviceMotionEvent) ? (DeviceMotionEvent.requestPermission()
				.then(v => (v === "granted") ? Promise.resolve() : Promise.reject())) : Promise.resolve()
		]);
	}

	#triggerCallbacks(type: MotionType, event: MotionObserverEvent) {
		for (let cb of this.#callbacks.get(type)!) {
			cb(event);
			if (event.cancelBubble) return;
		}
		for (let cb of this.#onceCallbacks.get(type)!) {
			cb(event);
			if (event.cancelBubble) break;
		}
		this.#onceCallbacks.get(type)!.clear();
	} 
	
	#handleOrientation = (e: DeviceOrientationEvent) => {
		if (this.#hasAbsoluteOrientation === null) {
			this.#hasAbsoluteOrientation = Date.now() + MEASUREMENT_EPSILON;
			return;
		}
		else if (typeof this.#hasAbsoluteOrientation === "number") {
			if (this.#hasAbsoluteOrientation < Date.now()) this.#hasAbsoluteOrientation = false;
			else return;
		}
		else if (this.#hasAbsoluteOrientation === true) {
			return;
		}
		const event = orientationEventFromDevice(e);
		this.#lastOrientationQuat = event.detail.quat;
		if (this.#observed.has(MotionType.Orientation)) this.#triggerCallbacks(MotionType.Orientation, event);
	}

	#handleOrientationAbsolute = (e: DeviceOrientationEvent) => {
		if (this.#hasAbsoluteOrientation !== true) {
			this.#hasAbsoluteOrientation = true;
			window.removeEventListener("deviceorientation", this.#handleOrientation);
		}
		if (this.#observed.has(MotionType.Orientation)) {
			const event = orientationEventFromDevice(e);
			this.#lastOrientationQuat = event.detail.quat;
			this.#triggerCallbacks(MotionType.Orientation, event);
		}
	} 

	#handleMotion = (e: DeviceMotionEvent) => {
		if (typeof this.#hasAccelerationWithoutGravity !== "boolean") {
			if ((e.acceleration?.x ?? 0) !== 0 || (e.acceleration?.y ?? 0) !== 0 || (e.acceleration?.z ?? 0) !== 0)
				this.#hasAccelerationWithoutGravity = true;
			else if (this.#hasAccelerationWithoutGravity === null) {
				this.#hasAccelerationWithoutGravity = Date.now() + MEASUREMENT_EPSILON;
				return;
			}
			else if (typeof this.#hasAccelerationWithoutGravity === "number") {
				if (this.#hasAccelerationWithoutGravity < Date.now()) this.#hasAccelerationWithoutGravity = false;
				else return;
			}
		}
		else {
			if (this.#hasAccelerationWithoutGravity) {
				if (this.#observed.has(MotionType.Acceleration)) {
					const event = accelerationEventFromDevice(e);
					this.#triggerCallbacks(MotionType.Acceleration, event);
				}
				if (this.#observed.has(MotionType.AccelerationInclGravity)) {
					const event = accelerationInclGravityEventFromDevice(e);
					this.#triggerCallbacks(MotionType.AccelerationInclGravity, event);
				}
			}
			else {
				const sendAdjustedEvent = this.#observed.has(MotionType.Acceleration) && this.#lastOrientationQuat;
				if (this.#observed.has(MotionType.AccelerationInclGravity) || sendAdjustedEvent) {
					const event = accelerationInclGravityEventFromDevice(e)
					if (this.#observed.has(MotionType.AccelerationInclGravity))
						this.#triggerCallbacks(MotionType.AccelerationInclGravity, event);
					if (sendAdjustedEvent)
						this.#triggerCallbacks(MotionType.Acceleration, accelerationEventFromAccInclGravityEventAndOrientationQuat(event, this.#lastOrientationQuat!));
				}
			}
		}
	}

	#removeListeners() {
		window.removeEventListener("devicemotion", this.#handleMotion);
		window.removeEventListener("deviceorientation", this.#handleOrientation);
		window.removeEventListener("deviceorientationabsolute", this.#handleOrientationAbsolute);
	}

	#addListeners() {
		// Remove any existing listeners before re-adding.
		this.#removeListeners();

		const requiredNativeEvents = new Set<NativeEventType>();
		this.#observed.forEach(e => {
			switch (e) {
				case MotionType.Orientation:
					requiredNativeEvents.add(NativeEventType.Orientation);
					requiredNativeEvents.add(NativeEventType.OrientationAbsolute);
					break;
				case MotionType.AccelerationInclGravity:
					requiredNativeEvents.add(NativeEventType.Motion);
					break;
				case MotionType.Acceleration: 
					requiredNativeEvents.add(NativeEventType.Motion);
					requiredNativeEvents.add(NativeEventType.Orientation);
					break;
				default:
					e satisfies never;
			}
		});

		requiredNativeEvents.forEach(e => {
			switch (e) {
				case NativeEventType.Orientation:
					window.addEventListener(e, this.#handleOrientation);
					break;
				case NativeEventType.OrientationAbsolute:
					window.addEventListener(e, this.#handleOrientationAbsolute);
					break;
				case NativeEventType.Motion:
					window.addEventListener(e, this.#handleMotion);
					break;
			}
		});
	}

	/** 
	 * Observes for motion, optionally filtering to specific motion types. 
	 * On some devices (iOS), this will prompt a permissions dialogue if it has not already been prompted 
	 * by `requestPermissions`. This prompt will not appear and will automatically fail if `observe` or
	 * `requestPermissions` is not triggered by a user interaction. The promise returned by this function will
	 * reject if permissions are denied or cannot be prompted.
	 */
	async observe(filter?: Iterable<MotionType>): Promise<void> {
		const filterArr = [...(filter ?? Object.values(MotionType))];
		if (filterArr.length) filterArr.forEach(e => this.#observed.add(e));
		await MotionObserver.requestPermissions();
		this.#addListeners();
	}

	/** Stops observing the specified motion types, or all motion types if no filter is specified. */
	unobserve(filter?: Iterable<MotionType>) {
		const filterArr = [...(filter ?? Object.values(MotionType))];
		if (filterArr.length) filterArr.forEach(e => this.#observed.delete(e));
		this.#addListeners();
	}

	/** 
	 * Disconnects the MotionObserver, stopping any more events from being issued. 
	 * Does not remove existing event listeners. 
	 * Listening may be resumed by calling `observe` with one or more event types.
	 */
	disconnect() {
		this.#observed.clear();
		this.#removeListeners();
		this.#callbacks.clear();
		this.#onceCallbacks.clear();
		this.#lastOrientationQuat = null;
	}

	/** 
	 * Calls `cb` when an event is fired for the specified event type. 
	 * Will NOT start listening to an event type if it was filtered out when calling `observe`. 
	 */
	addEventListener<T extends MotionType>(event: T, cb: (event: MotionObserverEvents[T]) => void) {
		this.bind(event, cb);
	}
	/** Shorthand for `addEventListener`. */
	bind<T extends MotionType>(event: T, cb: (event: MotionObserverEvents[T]) => void) {
		this.#callbacks.get(event)!.add(cb as any);
	}
	/** Shorthand for `addEventListener`. */
	on<T extends MotionType>(event: T, cb: (event: MotionObserverEvents[T]) => void) {
		this.bind(event, cb);
	}
	/** Functions like `bind`, but the listener is unbound immediately after being called the first time. */
	once<T extends MotionType>(event: T, cb: (event: MotionObserverEvents[T]) => void) {
		this.#onceCallbacks.get(event)!.add(cb as any);
	}
	/** Removes an event listener from a specific event. Returns true if the callback was found. */
	removeEventListener<T extends MotionType>(event: T, cb: (event: MotionObserverEvents[T]) => void) {
		return this.unbind(event, cb);
	}
	/** Shorthand for `removeEventListener`. */
	unbind<T extends MotionType>(event: T, cb: (event: MotionObserverEvents[T]) => void) {
		return this.#callbacks.get(event)!.delete(cb as any) || 
			this.#onceCallbacks.get(event)!.delete(cb as any);
	}
	/** Shorthand for `removeEventListener`. */
	off<T extends MotionType>(event: T, cb: (event: MotionObserverEvents[T]) => void) {
		return this.unbind(event, cb);
	}
}
