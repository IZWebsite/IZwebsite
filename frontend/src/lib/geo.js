import { useSyncExternalStore } from "react";

// status: "checking" | "granted" | "denied" | "off"
let state = { coords: null, extra: 0, status: "checking" };
const subs = new Set();
export const getGeo = () => state;
export const setGeo = (p) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
export const useGeo = () => useSyncExternalStore(subscribe, getGeo);
export const geoExtra = () => Number(state.extra || 0);
