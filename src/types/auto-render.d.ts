declare module "katex/dist/contrib/auto-render.mjs" {
  interface RenderMathInElementOptions {
    delimiters?: Array<{
      left: string;
      right: string;
      display: boolean;
    }>;
    ignoredTags?: string[];
    ignoredClasses?: string[];
    errorCallback?: (msg: string, err: Error) => void;
    throwOnError?: boolean;
    trust?:
      | boolean
      | ((context: {
          command: string;
          url: string;
          protocol: string;
          tag: string;
        }) => boolean);
    // ほかに必要ならここに定義を追加
  }

  export default function renderMathInElement(
    element: HTMLElement,
    options?: RenderMathInElementOptions
  ): void;
}
