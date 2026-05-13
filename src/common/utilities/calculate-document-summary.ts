// calculate-document-summary.ts

// 1. Interfaz genérica para cualquier línea que tenga precios e impuestos
export interface IDocumentItem {
  quantity: number;
  priceAtTime: number;
  ivaAtTime: number;
  surchargeAtTime: number;
}

export interface TaxBreakdown {
  base: number;
  iva: number;
  re: number;
  taxRate: number;
  reRate: number;
}

// 2. Resumen genérico
export interface DocumentSummary {
  baseImponibleTotal: number;
  ivaTotal: number;
  reTotal: number;
  totalFinal: number;
  taxGroups: TaxBreakdown[];
}

// 3. Función genérica
export function calculateDocumentSummary(
  items: IDocumentItem[],
): DocumentSummary {
  let baseImponibleTotal = 0;
  let ivaTotal = 0;
  let reTotal = 0;

  const groups: Record<string, TaxBreakdown> = {};

  items.forEach((item) => {
    const qty = Number(item.quantity);
    const price = Number(item.priceAtTime);
    const ivaRate = Number(item.ivaAtTime);
    const reRate = Number(item.surchargeAtTime || 0);

    const baseLinea = price * qty;
    const cuotaIva = baseLinea * (ivaRate / 100);
    const cuotaRe = baseLinea * (reRate / 100);

    baseImponibleTotal += baseLinea;
    ivaTotal += cuotaIva;
    reTotal += cuotaRe;

    const key = `${ivaRate}-${reRate}`;
    if (!groups[key]) {
      groups[key] = {
        base: 0,
        iva: 0,
        re: 0,
        taxRate: ivaRate,
        reRate: reRate,
      };
    }

    groups[key].base += baseLinea;
    groups[key].iva += cuotaIva;
    groups[key].re += cuotaRe;
  });

  return {
    baseImponibleTotal: Number(baseImponibleTotal.toFixed(2)),
    ivaTotal: Number(ivaTotal.toFixed(2)),
    reTotal: Number(reTotal.toFixed(2)),
    totalFinal: Number((baseImponibleTotal + ivaTotal + reTotal).toFixed(2)),
    taxGroups: Object.values(groups).map((g) => ({
      ...g,
      base: Number(g.base.toFixed(2)),
      iva: Number(g.iva.toFixed(2)),
      re: Number(g.re.toFixed(2)),
    })),
  };
}
