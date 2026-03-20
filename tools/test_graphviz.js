const { Graphviz } = require('@hpcc-js/wasm-graphviz');

const dot = `
digraph visitor {
  rankdir=TB;
  bgcolor="#1e1e2e";
  node [fontname="Consolas" fontsize=10 style=filled shape=box];
  edge [fontname="Segoe UI" fontsize=9];

  subgraph cluster_cst {
    label="CST 노드";
    labelloc=t;
    fontname="Segoe UI"; fontsize=11; fontcolor="#f38ba8";
    style=dashed; color="#f38ba8";
    bgcolor="#1e1e2e";
    
    messageDef [label="messageDef" fillcolor="#2c3e50" fontcolor="#f38ba8" color="#f38ba8" penwidth=1.5];
    messageName [label="messageName" fillcolor="#2c3e50" fontcolor="#f38ba8" color="#f38ba8"];
    doMsgNameDef [label="doMsgNameDef" fillcolor="#2c3e50" fontcolor="#555555" color="#555555" style="filled,dashed"];
    messageBody [label="messageBody" fillcolor="#2c3e50" fontcolor="#f38ba8" color="#f38ba8"];
    idPlayer [label="ID(\\"Player\\")" fillcolor="#1a2a3a" fontcolor="#7ec8e3" color="#5ba3d9"];
    field0 [label="field[0]" fillcolor="#2c3e50" fontcolor="#f38ba8" color="#f38ba8"];
    field1 [label="field[1]" fillcolor="#2c3e50" fontcolor="#f38ba8" color="#f38ba8"];
    
    messageDef -> messageName [color="#f38ba8"];
    messageDef -> doMsgNameDef [color="#555555" style=dashed];
    messageDef -> messageBody [color="#f38ba8"];
    messageName -> idPlayer [color="#f38ba8"];
    messageBody -> field0 [color="#f38ba8"];
    messageBody -> field1 [color="#f38ba8"];
  }

  subgraph cluster_visitor {
    label="AstBuilder : Visitor";
    labelloc=t;
    fontname="Segoe UI"; fontsize=12; fontcolor="#89b4fa";
    style=solid; color="#89b4fa"; penwidth=1.5;
    bgcolor="#1a2535";
    
    VisitMessageDef [label="VisitMessageDef(ctx)\\nname = ctx.messageName()\\n  .GetText();" fillcolor="#2c3e50" fontcolor="#89b4fa" color="#89b4fa"];
    VisitField [label="VisitField(ctx)\\ntype = ctx.type_().GetText()\\nname = ctx.fieldName()…" fillcolor="#2c3e50" fontcolor="#89b4fa" color="#89b4fa"];
    returnNode [label="return new\\n  MessageNode(...)" fillcolor="#1a3a2a" fontcolor="#a9dc76" color="#a9dc76"];
    
    VisitMessageDef -> VisitField [color="#89b4fa" style=dashed];
    VisitField -> returnNode [color="#89b4fa" style=dashed];
  }

  subgraph cluster_ast {
    label="AST 결과";
    labelloc=t;
    fontname="Segoe UI"; fontsize=11; fontcolor="#a9dc76";
    style=dashed; color="#a9dc76";
    bgcolor="#1e1e2e";
    
    MessageNode [label="MessageNode" fillcolor="#1a3a2a" fontcolor="#a9dc76" color="#a9dc76" penwidth=2];
    nameVal [label="name:\\"Player\\"" fillcolor="#1a3a2a" fontcolor="#7ec8e3" color="#a9dc76"];
    fieldsArr [label="fields[…]" fillcolor="#1a3a2a" fontcolor="#7ec8e3" color="#a9dc76"];
    FieldNode [label="FieldNode\\ntype:\\"string\\" name:\\"name\\"\\nnumber:1" fillcolor="#1a3a2a" fontcolor="#a9dc76" color="#a9dc76"];
    moreFields [label="…" fillcolor="#1a3a2a" fontcolor="#555555" color="#555555" style="filled,dashed"];
    
    MessageNode -> nameVal [color="#a9dc76"];
    MessageNode -> fieldsArr [color="#a9dc76"];
    fieldsArr -> FieldNode [color="#a9dc76"];
    fieldsArr -> moreFields [color="#a9dc76" style=dashed];
  }

  // Cross-cluster edges
  messageDef -> VisitMessageDef [label="Visit(messageDef)" color="#5ba3d9" fontcolor="#5ba3d9" style=dashed penwidth=1.5];
  field0 -> VisitField [label="Visit(field)" color="#5ba3d9" fontcolor="#5ba3d9" style=dashed penwidth=1.5];
  returnNode -> MessageNode [label="AST 노드 반환" color="#a9dc76" fontcolor="#a9dc76" penwidth=1.8];
}
`;

async function main() {
  const gv = await Graphviz.load();
  const svg = gv.dot(dot);
  // Remove XML declaration and DOCTYPE
  const cleanSvg = svg.replace(/<\?xml[^?]*\?>\s*/g, '').replace(/<!DOCTYPE[^>]*>\s*/g, '').trim();
  console.log(cleanSvg);
}

main().catch(console.error);
