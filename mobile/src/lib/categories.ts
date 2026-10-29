import type Ionicons from "@expo/vector-icons/Ionicons";

type IconName = keyof typeof Ionicons.glyphMap;

/** Icône et couleurs d'une catégorie, devinées d'après son nom (l'API ne fournit pas d'icône). */
const RULES: { words: string[]; icon: IconName; color: string; background: string }[] = [
  { words: ["electro", "telephon", "informatique", "tech", "tv"], icon: "phone-portrait-outline", color: "#2563EB", background: "#DBEAFE" },
  { words: ["mode", "vetement", "chaussure", "accessoire"], icon: "shirt-outline", color: "#EA580C", background: "#FFEDD5" },
  { words: ["maison", "jardin", "meuble", "deco"], icon: "home-outline", color: "#16A34A", background: "#DCFCE7" },
  { words: ["beaute", "sante", "cosmetique"], icon: "rose-outline", color: "#DB2777", background: "#FCE7F3" },
  { words: ["aliment", "boisson", "epicerie"], icon: "nutrition-outline", color: "#D97706", background: "#FEF3C7" },
  { words: ["sport", "loisir", "jeu", "jouet"], icon: "football-outline", color: "#7C3AED", background: "#EDE9FE" },
  { words: ["bebe", "enfant"], icon: "happy-outline", color: "#0891B2", background: "#CFFAFE" },
  { words: ["auto", "moto"], icon: "car-outline", color: "#475569", background: "#E2E8F0" },
];

const FALLBACK = { icon: "pricetag-outline" as IconName, color: "#EA580C", background: "#FFEDD5" };

export function categoryStyle(name: string) {
  const plain = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return RULES.find((rule) => rule.words.some((word) => plain.includes(word))) ?? FALLBACK;
}
