declare module "hyphen/en" {
  type Options = { hyphenChar?: string; minWordLength?: number; exceptions?: string[] };
  export function hyphenateSync(text: string, options?: Options): string;
  export function hyphenate(text: string, options?: Options): Promise<string>;
}
