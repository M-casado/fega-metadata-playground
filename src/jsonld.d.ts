declare module 'jsonld' {
  const jsonld: {
    expand(input: unknown, options?: unknown): Promise<unknown>;
    flatten(input: unknown, context?: unknown, options?: unknown): Promise<unknown>;
    frame(input: unknown, frame: unknown, options?: unknown): Promise<unknown>;
    toRDF(input: unknown, options?: unknown): Promise<string>;
  };
  export default jsonld;
}
