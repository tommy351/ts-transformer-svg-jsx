import type { SVGFactory } from "react";
import { createTransformer } from "./transformer";

export function svgToJsx(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  path: string
): SVGFactory {
  throw new Error(
    "Do not use svgToJsx directly. Please make sure ts-transformer-svg-jsx is set up properly."
  );
}

export default createTransformer;
