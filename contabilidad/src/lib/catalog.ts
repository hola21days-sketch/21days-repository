// Catalogo canonico. Cada entrada lista los alias con que aparece en el Excel,
// para que la importacion sea repetible y "Kreps Innova" y "Krepsinnova"
// acaben en la misma ficha.

export type ClientSeed = {
  name: string;
  aliases: string[];
  vatExempt?: boolean;
  monthlyFee?: number;
  status?: "ACTIVE" | "PAUSED" | "LOST";
  notes?: string;
};

export const CLIENTS: ClientSeed[] = [
  { name: "Dermaesthetic", aliases: [], monthlyFee: 1815 },
  { name: "Tekstila", aliases: [], status: "LOST", notes: "Ultima factura jul-26 (media cuota)." },
  { name: "Latremenda", aliases: [], monthlyFee: 1064.8 },
  { name: "Mireia Jubany", aliases: [], monthlyFee: 217.8 },
  { name: "Krepsinnova", aliases: ["Kreps Innova"], monthlyFee: 1028.5, status: "PAUSED", notes: "Pausa jun-sep 26, vuelve en oct-26." },
  { name: "Mossmatcha", aliases: [], monthlyFee: 834.9 },
  { name: "Jaume Rey", aliases: [], vatExempt: true, monthlyFee: 400, notes: "Se factura SIN IVA: excluido del IVA repercutido." },
  { name: "Nexiona", aliases: [], monthlyFee: 605 },
  { name: "Mims", aliases: ["Mims (redes)"], monthlyFee: 363 },
  { name: "Projecte influencers", aliases: ["Proj. influencers"], status: "LOST", notes: "Proyecto puntual ene-feb 26." },
  { name: "Dra Nogueres", aliases: [], monthlyFee: 1270.5 },
  { name: "GMS Basket", aliases: [], status: "LOST" },
  { name: "GMS Futbol", aliases: [], status: "LOST" },
  { name: "Elnouceller", aliases: [], monthlyFee: 484 },
  { name: "KBcrossfit", aliases: [], monthlyFee: 338.8 },
  { name: "Kevin Campos", aliases: [], monthlyFee: 544.5 },
  { name: "Celia Zanon", aliases: [], monthlyFee: 217.8 },
  { name: "Odicean", aliases: [], monthlyFee: 266.2 },
  { name: "Luba Company", aliases: [] },
  { name: "Claudia Rodriguez", aliases: [] },
  { name: "Olympo Box", aliases: ["Olympo Box Granollers"], monthlyFee: 2117.5 },
  { name: "Montse Fontseca", aliases: ["Monica Fontseca", "Montse fontseca"], monthlyFee: 1815 },
  { name: "Reformas San Marin", aliases: ["Reformas San Marín", "Mari Carmen Reformas"], monthlyFee: 726 },
  { name: "Sprinter", aliases: ["Sprinter x Violeta"], notes: "Proyecto de produccion, no cuota recurrente." },
];

export type ConceptSeed = {
  name: string;
  aliases: string[];
  category: "PAYROLL" | "STRUCTURE" | "TEAM" | "TAX" | "EXTRA" | "PROJECT";
  isFixed?: boolean;
  vatDeductible?: boolean;
  irpfRate?: number;
  notes?: string;
};

// vatDeductible refleja la formula real del Excel: solo Oficina, Gestoria,
// Softwares, Equip y Extres entran en el IVA soportado.
export const CONCEPTS: ConceptSeed[] = [
  { name: "Nomines (Aina+Adri)", aliases: ["Nòmines (Aina+Adri)", "Nòmines (paga 1r mes seg.)"], category: "PAYROLL", vatDeductible: false, notes: "Retencion 15% repartida al 50% entre Aina y Adri." },
  { name: "Oficina", aliases: ["Oficina (aguas, menjar...)"], category: "STRUCTURE" },
  { name: "Gestoria", aliases: [], category: "STRUCTURE" },
  { name: "Autonom Adri (TGSS)", aliases: [], category: "TAX", vatDeductible: false },
  { name: "Autonom Aina (TGSS)", aliases: [], category: "TAX", vatDeductible: false },
  { name: "Softwares", aliases: [], category: "STRUCTURE" },
  {
    name: "Equip (edicio/disseny)",
    aliases: ["Equip (edició/disseny)"],
    category: "TEAM",
    isFixed: false,
    // El Excel retiene un 7% sobre TODA esta linea agregada, no solo sobre la
    // parte de Marina. Lo reproducimos para los meses sin desglose (ene-jun 26)
    // y marcamos esos movimientos como "pendiente de desglosar": en cuanto se
    // reparta por proveedor, la retencion se corrige sola.
    irpfRate: 0.07,
    notes: "Linea agregada. Retencion aproximada del Excel hasta desglosar por proveedor.",
  },
  { name: "Marina Camp", aliases: ["Marina Camp (1.200€+IVA)"], category: "TEAM", irpfRate: 0.07, notes: "Autonoma de alta reciente: retencion reducida del 7%." },
  { name: "Lidia Rodriguez", aliases: ["Lidia Rodriguez (550€+IVA)"], category: "TEAM", irpfRate: 0.15 },
  { name: "Marta Cumplido", aliases: [], category: "TEAM", irpfRate: 0 },
  { name: "Edicio video", aliases: ["Edició vídeo (400€+IVA)"], category: "TEAM" },
  { name: "Extres", aliases: ["Extres  ↓ detall baix", "Extres previsió (600€ aprox)"], category: "EXTRA", isFixed: false },
  { name: "Envios DKSide", aliases: [], category: "PROJECT", isFixed: false, vatDeductible: false },
  { name: "Produccio DKSide", aliases: ["Producció DKSide"], category: "PROJECT", isFixed: false, vatDeductible: false },
];

export const EXTRA_INCOME_CONCEPT = "Extres ingressos";
