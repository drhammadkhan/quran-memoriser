# 3D Cosmos Visualiser — Technical Specification

This document details the architecture, mathematical formulas, and interaction pipeline for the 3D Cosmos Visualiser added to the Quran Memoriser.

## 1. 3D Engine Architecture

The visualiser runs an in-house Canvas 2D isometric/perspective 3D projection engine with zero external libraries. This ensures:
- **Instant load time**: 0 KB external bundle overhead.
- **100% offline capability**: Runs seamlessly in iOS Safari standalone PWA mode.
- **Ultra-smooth performance**: 60 FPS on mobile and desktop devices with adaptive point budgets and depth-sorting.

### Projection Formulas
Given a 3D coordinate in world space $(x, y, z)$ relative to camera target $(T_x, T_y, T_z)$, camera yaw $\theta$, camera pitch $\phi$, and focal length $F$:

$$\begin{aligned}
x_1 &= x - T_x, \quad y_1 = y - T_y, \quad z_1 = z - T_z \\
x_2 &= x_1 \cos\theta + z_1 \sin\theta \\
z_2 &= -x_1 \sin\theta + z_1 \cos\theta \\
y_3 &= y_1 \cos\phi - z_2 \sin\phi \\
z_3 &= y_1 \sin\phi + z_2 \cos\phi + \text{dist} \\
X_{\text{screen}} &= X_{\text{center}} + \frac{x_2 \cdot F}{z_3} \\
Y_{\text{screen}} &= Y_{\text{center}} + \frac{y_3 \cdot F}{z_3}
\end{aligned}$$

## 2. Polyhedral Geometry

Five 3D abstract polyhedra are dynamically projected, shaded, and edge-stroked:

1. **Merkaba (Star Tetrahedron / Octagram in 3D)**: Interlocking pair of dual regular tetrahedra ($8$ vertices, $8$ triangular facets). Used for **Memorised** chapters/verses.
2. **Icosahedron**: Regular polyhedron with 12 vertices and 20 equilateral triangular faces. Used for **Partial** chapters.
3. **Octahedron**: Dual of the cube with 6 vertices and 8 faces. Used for **Next** chapters.
4. **Cuboctahedron**: Archimedean solid with 12 vertices, 8 triangular faces, and 6 square faces. Used for **Later** chapters.
5. **Crystalline Wireframe Octahedron**: Delicate bronze-wireframe octahedron. Used for **Remaining / Not Set** chapters.

## 3. Colour Palette & Visual Language

| Status | Hex | RGB | Symbolism & Shading |
| :--- | :--- | :--- | :--- |
| **Memorised** | `#38d989` | `[56, 217, 137]` | Radiant emerald with warm gold inner core & rotating orbital halo ring |
| **Partial** | `#f06284` | `[240, 98, 132]` | Luminous rose ruby with inner emerald progress core reflecting memorised ratio |
| **Next** | `#f79d42` | `[247, 157, 66]` | Warm solar amber with slow breathing pulse |
| **Later** | `#68a4ff` | `[104, 164, 255]` | Serene celestial sapphire blue |
| **Remaining** | `#b5a686` | `[181, 166, 134]` | Warm antique parchment / celestial bronze |

## 4. Exploration Pipeline

- **Macro Galaxy (`#/visualise`)**:
  - Displays all 114 chapters (or filtered to the Last 21 chapters).
  - Chapter size scales as $R = 8.5 + 24 \cdot (\text{verses} / 287)^{0.42}$.
  - Supports 3 formations: **Golden Spiral** ($r \propto \sqrt{i}, \theta = i \cdot 137.5^\circ$), **Fibonacci Sphere**, and **Ascending Double Helix**.
  - Clicking any chapter smoothly dives the camera directly into that chapter's verse constellation.

- **Micro Verse Constellation (`#/visualise/{ch}`)**:
  - Displays every verse as an interactive 3D node arranged in an orbital vortex or ring.
  - Verse node size scales with Arabic word count ($7.5 + 14 \cdot (\min(\text{words}, 85) / 85)^{0.45}$).
  - Connected by luminous constellation lines linking sequential verses.
  - Clicking any verse:
    - Streams recitation audio directly via Maulana Feroz Alam (or selected reciter).
    - Shows Arabic text (Manzoor Naskh), phonetic transliteration, and English translation in a glassmorphic Inspector HUD.
    - Allows toggling the memorisation tick directly inside 3D, emitting golden celebration particle bursts!

- **Quranic Nebula Mode**:
  - Displays all 6,348 verses simultaneously in 3D space, showing memorised verses floating upwards in luminous emerald constellation layers while remaining verses drift below.
