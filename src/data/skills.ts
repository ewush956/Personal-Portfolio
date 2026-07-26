export interface Skill {
  name: string;
  icon: string;
}

/** Icons live in /public/images/icons (moved from the original site). */
export const SKILLS: Skill[] = [
  { name: 'HTML5', icon: '/images/icons/html.svg' },
  { name: 'CSS3', icon: '/images/icons/css.svg' },
  { name: 'JavaScript', icon: '/images/icons/javascript.svg' },
  { name: 'React', icon: '/images/icons/react.svg' },
  { name: 'Node.js', icon: '/images/icons/nodejs.svg' },
  { name: 'SQL', icon: '/images/icons/mysql.svg' },
  { name: 'C', icon: '/images/icons/c.svg' },
  { name: 'C++', icon: '/images/icons/c++.svg' },
  { name: 'Java', icon: '/images/icons/java.svg' },
  { name: 'Python', icon: '/images/icons/python.svg' },
  { name: 'Haskell', icon: '/images/icons/haskell.svg' },
  { name: 'Kotlin', icon: '/images/icons/kotlin.svg' },
  { name: 'Docker', icon: '/images/icons/docker.svg' },
  { name: 'Git', icon: '/images/icons/git.svg' },
  { name: 'Android', icon: '/images/icons/android.svg' },
];
