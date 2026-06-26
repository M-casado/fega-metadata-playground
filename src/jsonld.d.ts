declare module 'jsonld' {
  const jsonld: {
    expand(input: unknown, options?: unknown): Promise<unknown>;
    flatten(input: unknown, context?: unknown, options?: unknown): Promise<unknown>;
  };
  export default jsonld;
}
