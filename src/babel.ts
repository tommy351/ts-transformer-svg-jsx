import type { PluginObj, types } from "@babel/core";
import type * as svg from "svg-parser";
import assert from "assert";
import possibleStandardNames from "./possibleStandardNames";
import { readSvgFile, resolvePath } from "./utils";

type JSXAttribute = types.JSXAttribute | types.JSXSpreadAttribute;
type JSXChild =
  | types.JSXText
  | types.JSXExpressionContainer
  | types.JSXSpreadChild
  | types.JSXElement
  | types.JSXFragment;

export default function (babel: { types: typeof types }): PluginObj {
  const t = babel.types;

  function createLiteral(value?: string | number | boolean) {
    if (typeof value === "string") {
      return t.stringLiteral(value);
    }

    if (typeof value === "number") {
      return t.numericLiteral(value);
    }

    if (typeof value === "boolean") {
      return t.booleanLiteral(value);
    }

    return t.nullLiteral();
  }

  function generateSvgElement(
    node: svg.ElementNode,
    additionalProps?: readonly JSXAttribute[]
  ) {
    assert(node.tagName);

    const tagName = t.jsxIdentifier(node.tagName);
    const attributes: JSXAttribute[] = [];

    for (const [key, value] of Object.entries(node.properties || {})) {
      attributes.push(
        t.jsxAttribute(
          t.jsxIdentifier(possibleStandardNames[key] || key),
          t.jsxExpressionContainer(createLiteral(value))
        )
      );
    }

    if (additionalProps) {
      attributes.push(...additionalProps);
    }

    const children: JSXChild[] = [];

    for (const child of node.children) {
      if (typeof child === "string") continue;
      children.push(generateJsx(child));
    }

    return t.jsxElement(
      t.jsxOpeningElement(tagName, attributes),
      t.jsxClosingElement(tagName),
      children,
      !children.length
    );
  }

  function generateSvgText(node: svg.TextNode) {
    return t.jsxExpressionContainer(createLiteral(node.value));
  }

  function generateJsx(
    svgNode: svg.Node,
    additionalProps?: readonly JSXAttribute[]
  ) {
    switch (svgNode.type) {
      case "element":
        return generateSvgElement(svgNode, additionalProps);
      case "text":
        return generateSvgText(svgNode);
    }
  }

  function generateFunctionComponent(
    returnNode: types.Expression,
    propsName: string
  ) {
    return t.functionExpression(
      undefined,
      [t.identifier(propsName)],
      t.blockStatement([t.returnStatement(returnNode)])
    );
  }

  return {
    name: "ts-transformer-svg-jsx",
    visitor: {
      ImportDeclaration(path) {
        const source = path.get("source");

        // Remove ts-transformer-svg-jsx import declarations
        if (source.node.value === "ts-transformer-svg-jsx") {
          path.remove();
        }
      },
      CallExpression(path, state) {
        // Rewrite svgToJsx call expressions
        const callee = path.get("callee");
        const args = path.get("arguments");

        if (!callee.isIdentifier() || callee.node.name !== "svgToJsx") {
          return;
        }

        if (!args.length) {
          throw new Error("Expected 1 argument in svgToJsx function, got 0");
        }

        const pathArg = args[0];

        if (!pathArg.isStringLiteral()) {
          throw new Error(
            "The first argument in svgToJsx function must be a string literal"
          );
        }

        const svgPath = resolvePath(pathArg.node.value, state.filename);
        const svgNode = readSvgFile(svgPath, state.opts as any);
        const propsName = "props";

        path.replaceWith(
          generateFunctionComponent(
            generateJsx(svgNode.children[0], [
              t.jsxSpreadAttribute(t.identifier(propsName)),
            ]) as types.Expression,
            propsName
          )
        );
      },
    },
  };
}
