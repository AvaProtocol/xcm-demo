// One XCM operation is 1_000_000_000 weight - almost certainly a conservative estimate.
// It is defined as a UnitWeightCost variable in runtime.
export const TURING_INSTRUCTION_WEIGHT = 1000000000;
// The proxy accounts are to be topped up if its balance fails below this number
export const MIN_BALANCE_IN_PROXY = 10;
export const TASK_FREQUENCY = 3600;
