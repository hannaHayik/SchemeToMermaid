import {
  Parsed, isProgram, Program, isExp, Exp, isDefineExp, isNumExp, VarDecl, isVarDecl, isBoolExp, isStrExp, isProcExp, isIfExp,
  isLetExp, isLitExp, isAppExp, isLetrecExp, isSetExp, isBinding, isPrimOp, CExp, Binding, isVarRef, parseL4, parseL4Exp, parseL4Program, makeProgram
} from "./L4-ast";
import { Result, makeOk, isOk, makeFailure, mapResult, bind } from "../shared/result";
import { Graph, makeGraph, makeDir, makeEdge, makeNodeDecl, Edge, NodeRef, makeNodeRef, NodeDecl, Node, isAtomicGraph, isCompoundGraph, CompoundGraph, isNodeDecl, isNodeRef } from "./mermaid-ast";
import { map, is } from "ramda";
import { isSExp, SExpValue, isEmptySExp, isCompoundSExp, isSymbolSExp } from "./L4-value";
import { isString, isNumber, isBoolean, isArray } from "../shared/type-predicates";
import { parse } from "../shared/parser";


//makeVarGen Generator
const makeVarGen = (): (v: string) => string => {
  let count: number = 0;
  return (v: string) => {
    count++;
    return `${v}_${count}`;
  };
};

//A failure graph for extreme cases, shouldn't be reached if all input is valid
const failGraph: Graph = makeGraph(makeDir("TD"), makeNodeDecl("FAILURE", "FAIL"));

//Variable's name generators for each type of node, including args,body,params,rands,exps...
const defineGen = makeVarGen(); const varRefGen = makeVarGen(); const NumExpGen = makeVarGen(); const BoolExpGen = makeVarGen();
const StrExpGen = makeVarGen(); const ProcExpGen = makeVarGen(); const IfExpGen = makeVarGen(); const LetExpGen = makeVarGen();
const LitExpGen = makeVarGen(); const AppExpGen = makeVarGen(); const LetRecGen = makeVarGen(); const SetExpGen = makeVarGen();
const BindExpGen = makeVarGen(); const PrimOpGen = makeVarGen(); const VarDeclGen = makeVarGen(); const numberGen = makeVarGen();
const boolGen = makeVarGen(); const CompoundSExpGen = makeVarGen(); const EmptySExpGen = makeVarGen();
const SymbolSExpGen = makeVarGen(); const stringGen = makeVarGen(); const expsGen = makeVarGen(); const paramsGen = makeVarGen();
const bodyGen = makeVarGen(); const ratorGen = makeVarGen(); const randsGen = makeVarGen(); const bindingsGen = makeVarGen();
const programGen = makeVarGen();

//Edges generator for VarDecls[] (ex: in ProcExp handling)
const varDeclsEdges = (variabs: VarDecl[], node: NodeRef): Edge[] =>
  map((varia: VarDecl): Edge => makeEdge(node, nodeDeclGen(varia)), variabs)

//Convert boolean values to L4 syntax
const boolConvert = (bool: boolean): string =>
  bool == true ? "#t" : "#f";

//VarGen dispatch for SExpValue (returns proper name according to type)
const SExpNodeDecl = (exp: SExpValue): NodeDecl =>
  isEmptySExp(exp) ? makeNodeDecl(EmptySExpGen("EmptySExp"), "EmptySExp") :
    isCompoundSExp(exp) ? makeNodeDecl(CompoundSExpGen("CompoundSExp"), "CompoundSExp") :
      isSymbolSExp(exp) ? makeNodeDecl(SymbolSExpGen("SymbolSExp"), "SymbolSExp") :
        isString(exp) ? makeNodeDecl(stringGen("string"), `string(${exp})`) :
          isNumber(exp) ? makeNodeDecl(numberGen("number"), `number(${exp})`) :
            isBoolean(exp) ? makeNodeDecl(boolGen("boolean"), `boolean(${boolConvert(exp)})`) :
              makeNodeDecl("Failure", "FailNode")

//Abstract VarGen function, allows to use in many places 
const nodeDeclGen = (exp: Exp | VarDecl | Binding | SExpValue | Program): NodeDecl =>
  isProgram(exp) ? makeNodeDecl(programGen("Program"), "Program") :
    isDefineExp(exp) ? makeNodeDecl(defineGen("DefineExp"), "DefineExp") :
      isVarDecl(exp) ? makeNodeDecl(VarDeclGen("VarDecl"), `VarDecl(${exp.var})`) :
        isNumExp(exp) ? makeNodeDecl(NumExpGen("NumExp"), `NumExp(${exp.val})`) :
          isBoolExp(exp) ? makeNodeDecl(BoolExpGen("BoolExp"), `BoolExp(${boolConvert(exp.val)})`) :
            isStrExp(exp) ? makeNodeDecl(StrExpGen("StrExp"), `StrExp(${exp.val})`) :
              isProcExp(exp) ? makeNodeDecl(ProcExpGen("ProcExp"), "ProcExp") :
                isIfExp(exp) ? makeNodeDecl(IfExpGen("IfExp"), "IfExp") :
                  isLetExp(exp) ? makeNodeDecl(LetExpGen("LetExp"), "LetExp") :
                    isLitExp(exp) ? makeNodeDecl(LitExpGen("LitExp"), "LitExp") :
                      isAppExp(exp) ? makeNodeDecl(AppExpGen("AppExp"), "AppExp") :
                        isLetrecExp(exp) ? makeNodeDecl(LetRecGen("LetRecExp"), "LetRecExp") :
                          isSetExp(exp) ? makeNodeDecl(SetExpGen("SetExp"), "SetExp") :
                            isPrimOp(exp) ? makeNodeDecl(PrimOpGen("PrimOp"), `PrimOp(${exp.op})`) :
                              isBinding(exp) ? makeNodeDecl(BindExpGen("Binding"), "Binding") :
                                isSExp(exp) ? SExpNodeDecl(exp) :
                                  isVarRef(exp) ? makeNodeDecl(varRefGen("VarRef"), `VarRef(${exp.var})`) :
                                    makeNodeDecl("Failure", "FailNode")



//REM-Recursive Edge Maker: gets a Node (NodeDecl for first appearence, NodeRef otherwise) referring to the exp that we got
//according to the exp's type we connect & create edges to the node we have.
//This function only looks "down" the tree in a way that the current node is already created and what is left is to connect it's
//children, for example Atomic types wont have children so we return empty[] for them and they were already connected to father's node
//in the previous call in the recursive frame.
export const handler = (fatherNode: Node, exp: Exp | Binding | SExpValue | Program): Edge[] => {
  if (isProgram(exp)) {
    const expsPsuedoNode: NodeDecl = makeNodeDecl(expsGen("Exps"), ":");  //create exps psuedo node
    const expsNodes: NodeDecl[] = map(nodeDeclGen, exp.exps);  //create the exps nodes (exps[] node each)
    //connect exps[i] to exps psuedo node (we use NodeRef because the first appearence was made when connected to the psuedo node)
    const childsEdges: Edge[] = map((node: Node): Edge => makeEdge(makeNodeRef(expsPsuedoNode.id), node), expsNodes);
    //zip function is our way of using map() for two arrays (same length ofc), here we compute edges for every exps child node
    //through recursive calling to handler, and zip lets us send every expression with it's node (NodeRef)
    const zip = (exp: Exp, i: number): Edge[] => handler(makeNodeRef(expsNodes[i].id), exp);
    //here we run the zip function against the exp.exps[] and the reduce is to flatten the 2D-Arrays we get 
    const curEdges: Edge[] = (exp.exps.map((x, i) => zip(x, i))).reduce((accumulator, value) => accumulator.concat(value), []);
    //we give back the edges of the childs plus the edges between the psuedo Node & it's childs
    return [makeEdge(fatherNode, expsPsuedoNode, "exps")].concat(curEdges, childsEdges);
  }
  if (isDefineExp(exp)) {
    const valNode: NodeDecl = nodeDeclGen(exp.val);
    const curEdges: Edge[] = [makeEdge(fatherNode, valNode, "val")].concat(makeEdge(makeNodeRef(fatherNode.id), nodeDeclGen(exp.var), "var"));
    return curEdges.concat(handler(makeNodeRef(valNode.id), exp.val));
  }
  //mainEdges variable was later added to insure "some" order on child & father nodes.
  if (isProcExp(exp)) {
    const argsNode: NodeDecl = makeNodeDecl(paramsGen("Params"), ":");
    const bodyNode: NodeDecl = makeNodeDecl(bodyGen("Body"), ":");
    const bodyNodeDecls: NodeDecl[] = map(nodeDeclGen, exp.body);
    const zip = (exp: CExp, i: number): Edge[] => handler(makeNodeRef(bodyNodeDecls[i].id), exp);
    const bodyNodeEdges: Edge[] = map((node: NodeDecl): Edge => makeEdge(makeNodeRef(bodyNode.id), node), bodyNodeDecls);
    const mainEdges: Edge[] = [makeEdge(fatherNode, argsNode, "args"), makeEdge(makeNodeRef(fatherNode.id), bodyNode, "body")]
      .concat(varDeclsEdges(exp.args, makeNodeRef(argsNode.id)));
    const bodyEdges: Edge[] = (exp.body.map((x, i) => zip(x, i))).reduce((accumulator, value) => accumulator.concat(value), []);
    return mainEdges.concat(bodyNodeEdges, bodyEdges);
  }
  if (isIfExp(exp)) {
    const testNode: NodeDecl = nodeDeclGen(exp.test);
    const thenNode: NodeDecl = nodeDeclGen(exp.then);
    const altNode: NodeDecl = nodeDeclGen(exp.alt);
    const curEdges: Edge[] = [makeEdge(fatherNode, testNode, "test"),
    makeEdge(makeNodeRef(fatherNode.id), thenNode, "then"), makeEdge(makeNodeRef(fatherNode.id), altNode, "alt")];
    return curEdges.concat(handler(makeNodeRef(testNode.id), exp.test), handler(makeNodeRef(thenNode.id), exp.then), handler(makeNodeRef(altNode.id), exp.alt));
  }
  if (isAppExp(exp)) {
    const ratorNode: NodeDecl = nodeDeclGen(exp.rator);
    const randsNodes: NodeDecl[] = map(nodeDeclGen, exp.rands);
    const randNodePsuedo: NodeDecl = makeNodeDecl(randsGen("Rands"), ":");
    const mainEdges: Edge[] = [makeEdge(fatherNode, ratorNode, "rator"), makeEdge(makeNodeRef(fatherNode.id), randNodePsuedo, "rands")];
    const randsPsuedoEdges: Edge[] = map((node: NodeDecl): Edge => makeEdge(makeNodeRef(randNodePsuedo.id), node), randsNodes);
    const ratorEdges: Edge[] = handler(makeNodeRef(ratorNode.id), exp.rator);
    const zip = (exp: CExp, i: number): Edge[] => handler(makeNodeRef(randsNodes[i].id), exp);
    const randsEdges: Edge[] = (exp.rands.map((x, i) => zip(x, i))).reduce((accumulator, value) => accumulator.concat(value), []);
    return mainEdges.concat(randsPsuedoEdges, randsEdges, ratorEdges);
  }
  //Same proccessing, nodeDeclGen() allows us to use same code, as the only difference is in naming the exp.
  if (isLetExp(exp) || isLetrecExp(exp)) {
    const bindsPsuedoNode: NodeDecl = makeNodeDecl(bindingsGen("Bindings"), ":");
    const bodyPsuedoNode: NodeDecl = makeNodeDecl(bodyGen("Body"), ":");
    const bodyNodes: NodeDecl[] = map(nodeDeclGen, exp.body);
    const bindsNodes: NodeDecl[] = map(nodeDeclGen, exp.bindings);
    const mainEdges: Edge[] =
      [makeEdge(fatherNode, bindsPsuedoNode, "bindings"), makeEdge(makeNodeRef(fatherNode.id), bodyPsuedoNode, "body")];
    const bindsEdges: Edge[] = map((node: NodeDecl): Edge => makeEdge(makeNodeRef(bindsPsuedoNode.id), node), bindsNodes);
    const bodyEdges: Edge[] = map((node: NodeDecl): Edge => makeEdge(makeNodeRef(bodyPsuedoNode.id), node), bodyNodes);
    const zip = (exp: CExp, i: number): Edge[] => handler(makeNodeRef(bodyNodes[i].id), exp);
    const zip2 = (exp: Binding, i: number): Edge[] => handler(makeNodeRef(bindsNodes[i].id), exp);
    const Edges1: Edge[] = (exp.body.map((x, i) => zip(x, i))).reduce((accumulator, value) => accumulator.concat(value), []);
    const Edges2: Edge[] = (exp.bindings.map((x, i) => zip2(x, i))).reduce((accumulator, value) => accumulator.concat(value), []);
    return mainEdges.concat(bindsEdges, bodyEdges, Edges1, Edges2);
  }
  if (isLitExp(exp)) {
    const valNode: NodeDecl = nodeDeclGen(exp.val);
    const mainEdge: Edge[] = [makeEdge(fatherNode, valNode, "val")];
    const valEdges: Edge[] = handler(makeNodeRef(valNode.id), exp.val);
    return mainEdge.concat(valEdges);
  }
  //SetExp and Binding have one difference in fields which is VarRef/VarDecl, using abstract method nodeDeclGen
  //allows us to process them in the same case with the right expressions without doubling the code.
  if (isSetExp(exp) || isBinding(exp)) {
    const varNode: NodeDecl = nodeDeclGen(exp.var);
    const valueNode: NodeDecl = nodeDeclGen(exp.val);
    const mainEdges: Edge[] = [makeEdge(fatherNode, varNode, "var"), makeEdge(makeNodeRef(fatherNode.id), valueNode, "val")];
    const valueEdges: Edge[] = handler(makeNodeRef(valueNode.id), exp.val);
    return mainEdges.concat(valueEdges);
  }
  //As explained above, previous edges were already made (father -> AtomicExp) and what is left here
  //is to calculate&include child's edges, but Atomics don't have childs so empty[] is returned.
  if (isNumExp(exp) || isBoolExp(exp) || isStrExp(exp) || isPrimOp(exp) || isVarRef(exp))
    return [];

  if (isSExp(exp)) {
    if (isNumber(exp) || isBoolean(exp) || isString(exp) || isEmptySExp(exp))
      return [];
    if (isSymbolSExp(exp)) {
      const valNode: NodeRef = makeNodeRef(nodeDeclGen(exp.val).id);
      return [makeEdge(fatherNode, valNode, "val")];
    }
    if (isCompoundSExp(exp)) {
      const val1Node: NodeDecl = nodeDeclGen(exp.val1);
      const val2Node: NodeDecl = nodeDeclGen(exp.val2);
      const mainEdges: Edge[] = [makeEdge(fatherNode, val1Node, "val1"), makeEdge(makeNodeRef(fatherNode.id), val2Node, "val2")];
      const Edges1: Edge[] = handler(makeNodeRef(val1Node.id), exp.val1);
      const Edges2: Edge[] = handler(makeNodeRef(val2Node.id), exp.val2);
      return mainEdges.concat(Edges1, Edges2);
    }
  }

  return []; //not reached
}

//Maps L4 Parsed value to a Mermaid graph
export const mapL4toMermaid = (exp: Parsed): Result<Graph> =>
  makeOk(makeGraph(makeDir("TD"), handler(nodeDeclGen(exp), exp)));

//adds quotes to atomic labels, returns s otherwise (in the examples atomic had quotes in the node's label...)
export const atomicQuotes = (s: string): string =>
  s.slice(0, 6) == "NumExp" || s.slice(0, 6) == "StrExp" || s.slice(0, 6) == "PrimOp" || s.slice(0, 6) == "VarRef" ||
    s.slice(0, 6) == "string" || s.slice(0, 7) == "boolean" || s.slice(0, 7) == "VarDecl" || s.slice(0, 7) == "BoolExp" ||
    s.slice(0, 6) == "number" ? (`"`.concat(s)).concat(`"`) : s

//Unparses Node according to if it was NodeDecl or NodeRef
export const unparseNode = (exp: Node): string =>
  isNodeDecl(exp) ? `${exp.id}[${atomicQuotes(exp.label)}]` :
    `${exp.id}`;

//Unparses Edge's optional label according to it's existence
export const unparseLabel = (exp: string | undefined) =>
  isString(exp) ? `|${exp}| ` :
    ` `;

//Unparses CompoundGraph (Array of Edges)
export const unparseComGraph = (exp: CompoundGraph): string =>
  (map((x: Edge): string => `${unparseNode(x.from)} -->${unparseLabel(x.label)}${unparseNode(x.to)}`, exp)).join("\n");

//Unparses a graph into a string
export const unparseMermaid = (exp: Graph): Result<string> =>
  isAtomicGraph(exp.graphCon) ? makeOk(`graph ${exp.dir.direction}\n${exp.graphCon.id}${exp.graphCon.label}`) :
    makeOk(`graph ${exp.dir.direction}\n`.concat(unparseComGraph(exp.graphCon)));

//Takes str: string, Returns Result<Parsed>, str can only be a Program|Exp otherwise it's an invalid syntax
export const parserV2 = (concrete: string): Result<Parsed> => {
  const tmp = parse(concrete);
  if (isOk(tmp) && (tmp.value[0]) == "L4")
    return parseL4Program(concrete);
  else
    if (isOk(tmp) && concrete !== "")
      return parseL4Exp(concrete);
  return makeFailure("wrong syntax");
}


//Takes string, parses it into L4 Parsed, Maps it into Mermaid syntax(graph), unparses Mermaid graph into string
//considering correct input (it's a program or an expression, otherwise code fails)
export const L4toMermaid = (concrete: string): Result<string> => {
  if (isOk(parseL4(concrete))) {
    return bind(bind(bind(parse(concrete), parseL4Program), mapL4toMermaid), unparseMermaid);
  }
  else if (concrete.slice(1, 3) == "L4" || concrete == "")
    return makeFailure("Wrong Syntax Entered");
  else if (isOk(bind(parse(concrete), parseL4Exp)))
    return bind(bind(bind(parse(concrete), parseL4Exp), mapL4toMermaid), unparseMermaid);
  else
    return makeFailure("Wrong Syntax Entered");
}





