import { createContext, useContext } from 'react';
import type { LandingSection } from '../data/landingLayout';

export const LandingVisibility = createContext<readonly LandingSection[]>([]);

export function useLandingVisibility() {
  const hidden = useContext(LandingVisibility);
  return {
    services: !hidden.includes('services'),
    cases: !hidden.includes('cases'),
    about: !hidden.includes('testimonials'),
    contact: !hidden.includes('contact'),
  };
}
