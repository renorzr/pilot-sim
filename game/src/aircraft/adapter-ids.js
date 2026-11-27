// Registration names are separate from airframe brands. Adding a system adapter
// requires an implementation in its owning module and a name in this manifest.
export const AIRCRAFT_ADAPTERS=Object.freeze({
 controls:Object.freeze({rateServo:'rate-servo-v1'}),
 thrust:Object.freeze({detentAutothrust:'detent-autothrust-v1'}),
 cockpit:Object.freeze({a320:'a320-v1',a380:'a380-v1'}),
});
