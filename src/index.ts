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

function generateSvgElement(node: ElementNode) {
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

  if (!node.children.length) {
    return ts.factory.createJsxSelfClosingElement(tagName, [], jsxAttributes);
  }

  return ts.factory.createJsxElement(
    ts.factory.createJsxOpeningElement(tagName, [], jsxAttributes),
    generateJsxChildren(node.children),
    ts.factory.createJsxClosingElement(tagName)
  );
}

function generateSvgText(node: TextNode) {
  return ts.factory.createJsxExpression(
    undefined,
    createLiteralValue(node.value)
  );
}

function generateJsxChildren(nodes: (string | Node)[]) {
  const children: ts.JsxChild[] = [];

  for (const node of nodes) {
    if (typeof node === "string") continue;

    switch (node.type) {
      case "element":
        children.push(generateSvgElement(node));
        break;
      case "text":
        children.push(generateSvgText(node));
        break;
    }
  }

  return children;
}

function generateJsx(content: string) {
  const rootNode = parse(content);
  if (!rootNode.children.length) return;
  return generateJsxChildren(rootNode.children)[0];
}

export default function transform(
  program: ts.Program
): ts.TransformerFactory<ts.SourceFile> {
  const typeChecker = program.getTypeChecker();

  return (ctx) => {
    const visitor: ts.Visitor = (node) => {
      // Remove ts-transformer-svgr import declarations
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === "ts-transformer-svgr"
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

        return generateJsx(svgContent);
      }

      return ts.visitEachChild(node, visitor, ctx);
    };

    return (sourceFile) => {
      return ts.visitNode(sourceFile, visitor);
    };
  };
}
