declare module 'n3' {
  interface Term {
    termType: string;
    value: string;
    datatype?: { value: string };
    language?: string;
  }

  interface Quad {
    subject: Term;
    predicate: Term;
    object: Term;
  }

  export class Parser {
    constructor(options?: { format?: string });
    parse(input: string): Quad[];
  }
}
