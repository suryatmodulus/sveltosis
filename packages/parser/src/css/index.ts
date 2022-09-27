import { walk } from 'svelte/compiler';
import * as csstree from 'css-tree';
import { camelCase } from 'lodash';
import { MitosisNode } from '@builder.io/mitosis';
import { Ast } from 'svelte/types/compiler/interfaces';
import { BaseNode } from 'estree';

import type { Style } from 'svelte/types/compiler/interfaces';

function bindTypeSelectorToNode(node: MitosisNode, block: string) {
  node.bindings.css = {
    code: block,
  };
}

function bindClassSelectorToNode(node: MitosisNode, block: string) {
  function appendToExisting(block: string) {
    return (
      node.bindings.css?.code.slice(0, Math.max(0, node.bindings.css?.code.length - 1)) +
      block.slice(1)
    );
  }

  node.bindings.css = {
    code: node.bindings.css?.code?.length ? appendToExisting(block) : block,
  };
}

function bindTypeSelector(children: MitosisNode[], selector: string, block: string) {
  for (const node of children) {
    if (node.name === selector) {
      bindTypeSelectorToNode(node, block);
    }

    if (node.children?.length) {
      bindTypeSelector(node.children, selector, block);
    }
  }
}

function bindClassSelector(children: MitosisNode[], selector: string, block: string) {
  for (const node of children) {
    if (node.properties?.class?.split(' ').includes(selector.slice(1))) {
      bindClassSelectorToNode(node, block);
    }

    if (node.children?.length) {
      bindClassSelector(node.children, selector, block);
    }
  }
}

function objectToString(object: Record<string, string>) {
  let string_ = '';

  for (const [p, value] of Object.entries(object)) {
    string_ = `${string_}${p}: "${value}",\n `;
  }

  return `{\n ${string_} \n}`;
}

export const parseCss = (ast: Ast, json: SveltosisComponent) => {
  walk(ast.css as BaseNode, {
    enter(node, parent) {
      if (node.type === 'Rule') {
        const cssNode = node as csstree.Rule;
        let parentNode = parent as csstree.CssNode | csstree.Declaration;

        const selector = csstree.generate(cssNode.prelude);
        const block: Record<string, string> = {};

        csstree.walk(cssNode.block, {
          enter(node_: csstree.CssNode) {
            if (node_.type === 'Value') {
              const children = node_.children.map((c) =>
                csstree.generate(c),
              ) as unknown as Array<string>;

              block[camelCase((parentNode as csstree.Declaration).property)] = children.join(' ');
            }
            parentNode = node_;
          },
        });

        const blockString = objectToString(block);
        const prelude = cssNode.prelude as unknown as csstree.SelectorListPlain;
        const children = prelude.children;
        const child = children[0] as csstree.SelectorListPlain;
        const type = child?.children[0]?.type;

        if (type === 'TypeSelector') {
          bindTypeSelector(json.children, selector, blockString);
        } else if (type === 'ClassSelector') {
          bindClassSelector(json.children, selector, blockString);
        }
        // todo: support .card > .input
        // todo: handle multiple blocks
      }
    },
  });
};
