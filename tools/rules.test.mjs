// Checks rules.mjs against the sample scripts and shaders of examples.mjs: `node --test tools/`.
import { test } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { examples } from './examples.mjs';
import { checkScript, checkShader, languageOf } from './rules.mjs';

const said = (issues) => issues.map((x) => `${x.line}: ${x.text}`);

for (const ex of examples) {
  test(`${ex.name}: ${ex.about}`, () => {
    const result = ex.lang === 'agsl'
      ? checkShader({ name: ex.name, code: ex.code })
      : checkScript({ name: ex.name, code: ex.code, lang: ex.lang, api: ex.api });
    deepStrictEqual(said(result.kolahal), ex.kolahal, 'what Kolahal says');
    deepStrictEqual(said(result.library), ex.library, 'what the library asks for');
  });
}

test('the language comes from the file name, else from the text', () => {
  deepStrictEqual(languageOf('a.lua'), 'lua');
  deepStrictEqual(languageOf('a.js'), 'js');
  deepStrictEqual(languageOf('a.agsl'), 'agsl');
  for (const ex of examples) deepStrictEqual(languageOf(null, ex.code), ex.lang, ex.name);
});
