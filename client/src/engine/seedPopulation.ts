/**
 * seedPopulation.ts
 * -----------------
 * Gera uma população inicial de digital twins representando a diversidade da
 * população brasileira: nomes regionais, gênero, faixas etárias, ocupações do
 * cotidiano e tons de pele com frequências aproximadas às do IBGE
 * (branca/parda/preta/indígena).
 */
import type { PersonaInjection } from '../types';

const NAMES_F = ['Maria', 'Ana', 'Júlia', 'Camila', 'Larissa', 'Fernanda', 'Aparecida', 'Luana', 'Patrícia', 'Rita', 'Cláudia', 'Beatriz', 'Jurema'];
const NAMES_M = ['José', 'João', 'Carlos', 'Pedro', 'Lucas', 'Mateus', 'Rafael', 'Antônio', 'Francisco', 'Geraldo', 'Wesley', 'Marcos', 'Sebastião'];
const SURNAMES = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Almeida', 'Nascimento', 'Araújo', 'Ferreira', 'Rodrigues', 'Gomes'];

const OCCUPATIONS = [
  'vendedor(a) ambulante', 'professora', 'motorista de aplicativo', 'padeiro(a)', 'costureira',
  'mecânico(a)', 'enfermeira', 'pedreiro', 'cabeleireira', 'feirante', 'garçom', 'sorveteiro(a)',
  'agricultor(a)', 'manicure', 'frentista', 'comerciante', 'cozinheira',
];

const TRAITS = [
  'comunicativo(a) e brincalhão(ona)', 'trabalhadora e reservada', 'religioso(a) e prestativo(a)',
  'sonhadora e criativa', 'teimoso(a) mas leal', 'alegre e festeiro(a)', 'cuidadosa e maternal',
  'desconfiado(a) mas justo(a)', 'curioso(a) e falante', 'calma e observadora',
];

const ORIGINS = [
  'Nasceu no interior e mudou-se para a cidade em busca de trabalho.',
  'Cresceu no bairro e conhece todo mundo por aqui.',
  'Veio do Nordeste ainda jovem e construiu a vida na cidade.',
  'Cria os filhos sozinha e batalha todo dia.',
  'Sonha em abrir o próprio negócio um dia.',
  'É voluntário(a) na associação de moradores.',
];

const SPRITES = ['villager', 'baker', 'farmer', 'merchant', 'artist', 'worker'];

/** Tons de pele com frequências aproximadas à composição brasileira. */
const SKINS: { hex: string; tom: string; weight: number }[] = [
  { hex: '#f0c9a8', tom: 'pele clara', weight: 43 },
  { hex: '#c79a6b', tom: 'pele parda', weight: 30 },
  { hex: '#a9744f', tom: 'pele morena', weight: 17 },
  { hex: '#6b4a33', tom: 'pele negra', weight: 9 },
  { hex: '#caa472', tom: 'traços indígenas', weight: 1 },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickSkin(): { hex: string; tom: string } {
  const total = SKINS.reduce((a, s) => a + s.weight, 0);
  let r = Math.random() * total;
  for (const s of SKINS) {
    r -= s.weight;
    if (r <= 0) return s;
  }
  return SKINS[0];
}

function makeTwin(): PersonaInjection {
  const female = Math.random() < 0.5;
  const first = female ? pick(NAMES_F) : pick(NAMES_M);
  const name = `${first} ${pick(SURNAMES)}`;
  const age = 18 + Math.floor(Math.random() * 55);
  const skin = pickSkin();
  const occupation = pick(OCCUPATIONS);
  const traits = pick(TRAITS);

  return {
    core: {
      name,
      age,
      occupation,
      appearance: `${skin.tom}, ${pick(['cabelo cacheado', 'cabelo liso', 'cabelo crespo', 'cabelo grisalho', 'careca', 'tranças'])}`,
      traits,
      spriteKey: pick(SPRITES),
      skin: skin.hex,
    },
    backstory: [
      `Trabalha como ${occupation} na cidade.`,
      pick(ORIGINS),
    ],
    relationships: [],
  };
}

/** Gera 5 digital twins distintos representando a população brasileira. */
export function seedBrazilianPopulation(): PersonaInjection[] {
  const twins: PersonaInjection[] = [];
  const usedNames = new Set<string>();
  while (twins.length < 5) {
    const t = makeTwin();
    if (usedNames.has(t.core.name)) continue;
    usedNames.add(t.core.name);
    twins.push(t);
  }
  // Cria alguns laços entre eles (vizinhança/amizade).
  if (twins.length >= 2) {
    twins[1].relationships.push(`É vizinho(a) de ${twins[0].core.name}.`);
    twins[2]?.relationships.push(`Conhece ${twins[1].core.name} da feira.`);
  }
  return twins;
}
