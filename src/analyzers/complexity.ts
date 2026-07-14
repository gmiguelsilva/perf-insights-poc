import ts from "typescript";

export interface FileComplexity {
  functionCount: number;
  totalComplexity: number;
  maxComplexity: number;
  linesOfCode: number;
}

const DECISION_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
]);

function scriptKindFor(fileName: string): ts.ScriptKind {
  if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (fileName.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (fileName.endsWith(".js") || fileName.endsWith(".mjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/**
 * Estimativa de complexidade ciclomatica por arquivo: 1 ponto base por funcao
 * + 1 ponto por estrutura de decisao (if/for/while/case/catch/ternario) e por
 * operador logico curto-circuito (&&, ||, ??). E uma heuristica de AST, nao
 * uma ferramenta de complexidade "oficial" (ex: escomplex) - suficiente para
 * comparar a evolucao relativa dentro desta POC.
 */
export function analyzeFileComplexity(fileName: string, sourceText: string): FileComplexity {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(fileName),
  );

  let functionCount = 0;
  let totalComplexity = 0;
  let maxComplexity = 0;

  function complexityOf(bodyNode: ts.Node): number {
    let complexity = 1;
    const walk = (node: ts.Node) => {
      if (DECISION_KINDS.has(node.kind)) {
        complexity++;
      } else if (ts.isBinaryExpression(node)) {
        const op = node.operatorToken.kind;
        if (
          op === ts.SyntaxKind.AmpersandAmpersandToken ||
          op === ts.SyntaxKind.BarBarToken ||
          op === ts.SyntaxKind.QuestionQuestionToken
        ) {
          complexity++;
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(bodyNode);
    return complexity;
  }

  const visit = (node: ts.Node) => {
    const isFunctionLike =
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node);

    if (isFunctionLike && "body" in node && node.body) {
      const complexity = complexityOf(node.body as ts.Node);
      functionCount++;
      totalComplexity += complexity;
      if (complexity > maxComplexity) maxComplexity = complexity;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  const linesOfCode = sourceText.split("\n").length;
  return { functionCount, totalComplexity, maxComplexity, linesOfCode };
}
