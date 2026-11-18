import { useContext, type ComponentType } from 'react';
import { SectionNodesContext } from './sectionContext';

const cache = new Map<string, ComponentType>();

/**
 * Har vidjet uchun BARQAROR komponent (id bo'yicha bir marta yaratiladi). Har
 * renderda yangi funksiya berilsa React uni boshqa tur deb hisoblab ichidagi
 * diagramma va holatni qayta yaratardi.
 */
export function sectionComponent(id: string): ComponentType {
  let component = cache.get(id);
  if (!component) {
    const SectionBody = () => {
      const nodes = useContext(SectionNodesContext);
      return <>{nodes[id] ?? null}</>;
    };
    SectionBody.displayName = `Section(${id})`;
    component = SectionBody;
    cache.set(id, component);
  }
  return component;
}
