import * as svgo from "svgo";
import ts from "typescript";
import * as svg from "svg-parser";
import { resolve, dirname } from "path";

export interface TransformerOptions {
  svgo?: svgo.OptimizeOptions;
}

export function isRelativePath(path: string): boolean {
  return path.startsWith("./") || path.startsWith("../");
}

export function readSvgFile(
  path: string,
  options: TransformerOptions = {}
): svg.RootNode {
  let content = ts.sys.readFile(path, "utf-8");

  if (typeof content !== "string") {
    throw new Error(`File "${path}" does not exist`);
  }

  if (options.svgo) {
    const optimizedSvg = svgo.optimize(content, {
      path,
      ...options.svgo,
    });

    content = optimizedSvg.data;
  }

  return svg.parse(content);
}

export function resolvePath(target: string, from: string): string {
  return isRelativePath(target)
    ? resolve(dirname(from), target)
    : require.resolve(target);
}
