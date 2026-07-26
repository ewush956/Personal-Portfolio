export interface ProjectLink {
  label: string;
  href: string;
}

export interface Project {
  title: string;
  blurb: string;
  tags: string[];
  image: string;
  links: ProjectLink[];
  /** YouTube video id — renders a "Watch demo" button that opens the modal. */
  demoVideo?: string;
  /** Marks the confetti easter-egg button (the old "mystery" button). */
  easterEgg?: boolean;
}

export const PROJECTS: Project[] = [
  {
    title: 'Computer Vision Schematic Parser',
    blurb:
      'A multi-stage computer vision pipeline that converts hand-drawn electrical schematics into structured XML. A fine-tuned YOLO model detects schematic symbols and text regions, a U-Net segments the wire topology, and TrOCR reads handwritten component labels. The pipeline reconstructs the full schematic by linking wires to components and exporting a clean digital representation.',
    tags: ['Python', 'YOLO', 'U-Net', 'TrOCR'],
    image: '/images/computer_vision.png',
    links: [
      { label: 'GitHub', href: 'https://github.com/ewush956/Computer-Vision-Schematic-Parser' },
    ],
  },
  {
    title: 'Mandlebrot Convergence Visualizer',
    blurb:
      'A web application that visualizes the convergence of points in the Mandelbrot set, letting users explore the fractal by panning and zooming. It renders escape-time iterations in real time to reveal the intricate boundary structure of the set — an interactive way to study how complex numbers behave under iteration.',
    tags: ['C', 'JavaScript', 'HTML', 'CSS'],
    image: '/images/mandlebrot.png',
    links: [
      { label: 'GitHub', href: 'https://github.com/ewush956/Mandlebrot-Convergence-Visualizer' },
      { label: 'Visit site', href: 'https://ewush956.github.io/Mandlebrot-Convergence-Visualizer' },
    ],
  },
  {
    title: 'Finance Research Dashboard',
    blurb:
      'My senior project: an interactive finance research dashboard that pulls live market data from Yahoo Finance and presents stock analysis through a modular tabbed interface — a data table view, standard deviation and volatility analysis, and Sharpe ratio analysis. Built around Shiny’s reactive UI/server separation, containerized with Docker and docker-compose, and packaged as a deployable image ready for AWS via ECR and ECS/Fargate or EC2.',
    tags: ['Python', 'Shiny', 'pandas', 'numpy', 'matplotlib', 'Docker'],
    image: '/images/directed_reading.png',
    links: [
      { label: 'GitHub', href: 'https://github.com/ewush956/Machine-Learning-in-Finance-Research' },
    ],
  },
  {
    title: 'Observing the Baldwin Effect in Pac-Man',
    blurb:
      'A research project combining reinforcement learning and a genetic algorithm to observe the "Baldwin effect." Pac-Man agents evolve innate Q-learning weight vectors across generations in a grid-world. Over time the genetic algorithm independently converges on the same weight configurations that in-lifetime learning would have found — demonstrating how learning capacity can guide evolution without direct inheritance.',
    tags: ['Python', 'PyGAD', 'scikit-learn', 'numpy'],
    image: '/images/pacman_demo.gif',
    links: [],
  },
  {
    title: 'Disk Scheduling Algorithm Visualizer',
    blurb:
      'A web application that visualizes disk scheduling algorithms — FCFS, SSTF, SCAN, C-SCAN, LOOK, and C-LOOK — to demonstrate how they work and how they compare in efficiency for different request patterns. Built to make core operating-systems concepts tangible.',
    tags: ['JavaScript', 'Tailwind CSS'],
    image: '/images/disk_light.png',
    links: [
      { label: 'GitHub', href: 'https://github.com/apuni866/Disk-Scheduling-Visualizer' },
      { label: 'Visit site', href: 'https://apuni866.github.io/Disk-Scheduling-Visualizer/' },
    ],
  },
  {
    title: '3D Pathfinder',
    blurb:
      'A representation of the Traveling Salesman Problem in 3D Cartesian space, featuring a live recursive backtracking visualization and a functional implementation in Haskell. The goal was to solve the same problem in both a declarative and an imperative language, surfacing the differences between programming paradigms.',
    tags: ['Python', 'Matplotlib', 'Haskell'],
    image: '/images/3dProject_img.png',
    links: [
      { label: 'GitHub', href: 'https://github.com/ewush956/Programming-Paradigms-Project' },
    ],
    demoVideo: 'ztl50Ilu-sg',
  },
  {
    title: 'Formula 1 Dashboard',
    blurb:
      'A single-page web application that leverages DOM manipulation and asynchronous JavaScript to display data from the Formula 1 API — where the API itself was also re-created as part of the project.',
    tags: ['JavaScript', 'Tailwind CSS', 'Node.js', 'Express'],
    image: '/images/f1_light.png',
    links: [
      { label: 'GitHub', href: 'https://github.com/ewush956/F1-Dashboard' },
      { label: 'Visit site', href: 'https://ewush956.github.io/F1-Dashboard/' },
    ],
  },
  {
    title: "Pacman's Revenge",
    blurb:
      'An arcade-style variant of "Pac-Man" built for Computing Machinery II, targeting the Steem emulator. Almost all reliance on the operating system was removed (except the Super() system call). A deep dive into low-level programming and hardware interaction, specific to the MC68000 architecture.',
    tags: ['C', 'Assembly'],
    image: '/images/pacman_img.png',
    links: [{ label: 'GitHub', href: 'https://github.com/ewush956/PacmansRevenge' }],
    easterEgg: true,
  },
];
