// Silences ReactDOM act() warnings in component tests unless explicitly asserted.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

export {};
