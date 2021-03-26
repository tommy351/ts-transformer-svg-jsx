import ts from "typescript";
import type { SVGFactory } from "react";
import { join, resolve, dirname } from "path";
import { ElementNode, Node, parse, TextNode } from "svg-parser";
import assert from "assert";

const INDEX_TS = join(__dirname, "index.d.ts");

export function svgToJsx(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  path: string
): SVGFactory {
  throw new Error(
    "Do not use svgToJsx directly. Please make sure ts-transformer-svg-jsx is set up properly."
  );
}

function isRelativePath(path: string) {
  return path.startsWith("./") || path.startsWith("../");
}

function createLiteralValue(value?: string | number | boolean) {
  if (typeof value === "string") {
    return ts.factory.createStringLiteral(value);
  }

  if (typeof value === "number") {
    return ts.factory.createNumericLiteral(value);
  }

  if (typeof value === "boolean") {
    return value ? ts.factory.createTrue() : ts.factory.createFalse();
  }

  return ts.factory.createNull();
}

function generateSvgElement(node: ElementNode, originalNode?: ts.Node) {
  assert(node.tagName);

  const tagName = ts.factory.createIdentifier(node.tagName);
  const attributes: ts.JsxAttributeLike[] = [];

  for (const [key, value] of Object.entries(node.properties || {})) {
    attributes.push(
      ts.factory.createJsxAttribute(
        ts.factory.createIdentifier(key),
        ts.factory.createJsxExpression(undefined, createLiteralValue(value))
      )
    );
  }

  const jsxAttributes = ts.factory.createJsxAttributes(attributes);
  const children: ts.JsxChild[] = [];

  for (const child of node.children) {
    if (typeof child === "string") continue;
    children.push(generateJsx(child, originalNode));
  }

  // Fix `TypeError: Cannot read property 'kind' of undefined` by
  // setting an original node.
  //
  // https://github.com/madou/typescript-transformer-handbook#emitresolver-cannot-handle-jsxopeninglikeelement-and-jsxopeningfragment-that-didnt-originate-from-the-parse-tree

  if (!children.length) {
    return ts.setOriginalNode(
      ts.factory.createJsxSelfClosingElement(tagName, [], jsxAttributes),
      originalNode
    );
  }

  return ts.factory.createJsxElement(
    ts.setOriginalNode(
      ts.factory.createJsxOpeningElement(tagName, [], jsxAttributes),
      originalNode
    ),
    children,
    ts.setOriginalNode(
      ts.factory.createJsxClosingElement(tagName),
      originalNode
    )
  );
}

function generateSvgText(node: TextNode) {
  return ts.factory.createJsxExpression(
    undefined,
    createLiteralValue(node.value)
  );
}

function generateJsx(svgNode: Node, originalNode?: ts.Node) {
  switch (svgNode.type) {
    case "element":
      return generateSvgElement(svgNode, originalNode);
    case "text":
      return generateSvgText(svgNode);
  }
}

export default function transform(
  program: ts.Program
): ts.TransformerFactory<ts.SourceFile> {
  const typeChecker = program.getTypeChecker();

  return (ctx) => {
    const visitor: ts.Visitor = (node) => {
      // Remove ts-transformer-svg-jsx import declarations
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === "ts-transformer-svg-jsx"
      ) {
        return;
      }

      // Rewrite svgr call expressions
      if (ts.isCallExpression(node)) {
        const declaration = typeChecker.getResolvedSignature(node)?.declaration;

        if (
          !declaration ||
          ts.isJSDocSignature(declaration) ||
          declaration.name?.getText() !== "svgToJsx" ||
          declaration.getSourceFile().fileName !== INDEX_TS
        ) {
          return node;
        }

        if (!node.arguments.length) {
          throw new Error("Expected 1 argument in svgr function, got 0");
        }

        const pathArg = node.arguments[0];

        if (!ts.isStringLiteral(pathArg)) {
          throw new Error(
            "The first argument in svgr function must be a string literal"
          );
        }

        const svgPath = isRelativePath(pathArg.text)
          ? resolve(dirname(node.getSourceFile().fileName), pathArg.text)
          : require.resolve(pathArg.text);

        const svgContent = ts.sys.readFile(svgPath, "utf-8");

        if (typeof svgContent !== "string") {
          throw new Error(`File "${svgPath}" does not exist`);
        }

        const svgNode = parse(svgContent);

        return generateJsx(svgNode.children[0], node);
      }

      return ts.visitEachChild(node, visitor, ctx);
    };

    return (sourceFile) => {
      return ts.visitNode(sourceFile, visitor);
    };
  };
}
