import { SensitiveMutation } from './sensitive-mutation.decorator';

const sensitiveLimitMetadata = 'THROTTLER:LIMITsensitive';

class MutationHandlers {
  @SensitiveMutation()
  regular() {
    return 'regular';
  }

  @SensitiveMutation(40)
  replay() {
    return 'replay';
  }
}

describe('SensitiveMutation', () => {
  it('keeps the secure default and permits a larger bounded replay sequence', () => {
    expect(Reflect.getMetadata(sensitiveLimitMetadata, MutationHandlers.prototype.regular)).toBe(10);
    expect(Reflect.getMetadata(sensitiveLimitMetadata, MutationHandlers.prototype.replay)).toBe(40);
  });
});
