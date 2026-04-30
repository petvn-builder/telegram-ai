declare module "d3-force" {
  export function forceCollide<T>(radius?: number | ((node: T) => number)): any
  export function forceCenter(x?: number, y?: number): any
  export function forceManyBody(): any
  export function forceLink(): any
  export function forceSimulation<T>(nodes?: T[]): any
  export function forceX<T>(x?: number | ((node: T) => number)): any
  export function forceY<T>(y?: number | ((node: T) => number)): any
  export function forceRadial<T>(radius: number | ((node: T) => number), x?: number, y?: number): any
}
