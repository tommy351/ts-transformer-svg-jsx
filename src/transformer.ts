import ts from "typescript";
import { join, resolve, dirname } from "path";
import { ElementNode, Node, parse, TextNode } from "svg-parser";
import assert from "assert";

const INDEX_TS = join(__dirname, "index.d.ts");

function isRelativePath(path: string) {
  return path.startsWith("./") || path.startsWith("../");
}

export function createTransformer(
  program: ts.Program
): ts.TransformerFactory<ts.SourceFile> {
  const typeChecker = program.getTypeChecker();

  return (ctx) => {
    function createLiteral(value?: string | number | boolean) {
      if (typeof value === "string") {
        return ctx.factory.createStringLiteral(value);
      }

      if (typeof value === "number") {
        return ctx.factory.createNumericLiteral(value);
      }

      if (typeof value === "boolean") {
        return value ? ctx.factory.createTrue() : ctx.factory.createFalse();
      }

      return ctx.factory.createNull();
    }

    function generateSvgElement(
      node: ElementNode,
      originalNode?: ts.Node,
      additionalProps?: readonly ts.JsxAttributeLike[]
    ) {
      assert(node.tagName);

      const tagName = ctx.factory.createIdentifier(node.tagName);
      const attributes: ts.JsxAttributeLike[] = [];

      for (const [key, value] of Object.entries(node.properties || {})) {
        attributes.push(
          ctx.factory.createJsxAttribute(
            ctx.factory.createIdentifier(key),
            ctx.factory.createJsxExpression(undefined, createLiteral(value))
          )
        );
      }

      if (additionalProps) {
        attributes.push(...additionalProps);
      }

      const jsxAttributes = ctx.factory.createJsxAttributes(attributes);
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
          ctx.factory.createJsxSelfClosingElement(tagName, [], jsxAttributes),
          originalNode
        );
      }

      return ctx.factory.createJsxElement(
        ts.setOriginalNode(
          ctx.factory.createJsxOpeningElement(tagName, [], jsxAttributes),
          originalNode
        ),
        children,
        ts.setOriginalNode(
          ctx.factory.createJsxClosingElement(tagName),
          originalNode
        )
      );
    }

    function generateSvgText(node: TextNode) {
      return ctx.factory.createJsxExpression(
        undefined,
        createLiteral(node.value)
      );
    }

    function generateJsx(
      svgNode: Node,
      originalNode?: ts.Node,
      additionalProps?: readonly ts.JsxAttributeLike[]
    ) {
      switch (svgNode.type) {
        case "element":
          return generateSvgElement(svgNode, originalNode, additionalProps);
        case "text":
          return generateSvgText(svgNode);
      }
    }

    function generateFunctionComponent(
      returnNode: ts.Expression,
      propsName: string
    ) {
      return ctx.factory.createFunctionExpression(
        undefined,
        undefined,
        undefined,
        undefined,
        [
          ctx.factory.createParameterDeclaration(
            undefined,
            undefined,
            undefined,
            propsName
          ),
        ],
        undefined,
        ctx.factory.createBlock([ctx.factory.createReturnStatement(returnNode)])
      );
    }

    const visitor: ts.Visitor = (node) => {
      // Remove ts-transformer-svg-jsx import declarations
      if (
        ts.isImportDeclaration(node) &&
        ts.isStringLiteral(node.moduleSpecifier) &&
        node.moduleSpecifier.text === "ts-transformer-svg-jsx"
      ) {
        return;
      }

      // Rewrite svgToJsx call expressions
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
          throw new Error("Expected 1 argument in svgToJsx function, got 0");
        }

        const pathArg = node.arguments[0];

        if (!ts.isStringLiteral(pathArg)) {
          throw new Error(
            "The first argument in svgToJsx function must be a string literal"
          );
        }

        // TODO: Resolve with the paths config in tsconfig.json.
        const svgPath = isRelativePath(pathArg.text)
          ? resolve(dirname(node.getSourceFile().fileName), pathArg.text)
          : require.resolve(pathArg.text);

        const svgContent = ts.sys.readFile(svgPath, "utf-8");

        if (typeof svgContent !== "string") {
          throw new Error(`File "${svgPath}" does not exist`);
        }

        const svgNode = parse(svgContent);
        const propsName = "props";

        return generateFunctionComponent(
          generateJsx(svgNode.children[0], node, [
            ctx.factory.createJsxSpreadAttribute(
              ctx.factory.createIdentifier(propsName)
            ),
          ]),
          propsName
        );
      }

      return ts.visitEachChild(node, visitor, ctx);
    };

    return (sourceFile) => {
      return ts.visitNode(sourceFile, visitor);
    };
  };
}
