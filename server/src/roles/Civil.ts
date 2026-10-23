import { Role } from './Role';

/** CIVIL: inocente sem habilidade. Observa, se esconde, foge. */
export class Civil extends Role {
  readonly id = 'civil' as const;
}
