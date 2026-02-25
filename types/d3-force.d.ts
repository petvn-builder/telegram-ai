declare module "d3-force" {
  export function forceCollide<T>(radius?: number | ((node: T) => number)): any
  export function forceCenter(x?: number, y?: number): any
  export function forceManyBody(): any
  export function forceLink(): any
  export function forceSimulation<T>(nodes?: T[]): any
}
