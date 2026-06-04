# Networx

Simulateur de réseaux pédagogique de type **Filius**, 100 % navigateur (aucune
installation, autosave local). Destiné aux élèves du gymnase : on construit une
topologie (PC, switch, routeur…), on configure les adresses IP, puis on envoie
des paquets que l'on **regarde circuler en temps réel** saut par saut, avec un
inspecteur couche par couche (Ethernet → IP → ICMP/TCP/UDP → données).

## Démarrer

```bash
npm install
npm run dev          # http://localhost:5173
```

## Scripts

```bash
npm run typecheck    # tsc --noEmit (mode strict)
npm run lint         # eslint .
npm run format       # prettier --write
npm run test         # vitest run
npm run test:coverage
npm run build        # tsc --noEmit && vite build
```

Voir [`CLAUDE.md`](CLAUDE.md) pour l'architecture et [`ROADMAP.md`](ROADMAP.md)
pour l'avancement par phases.

> Stack : React 18 + Vite + TypeScript strict, Tailwind CSS, lucide-react,
> Vitest. Architecture issue du skill `appweb` (logique pure testée séparée du
> rendu), transposée du projet jumeau **Logix** (simulateur de circuits).
