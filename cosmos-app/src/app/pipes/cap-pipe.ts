import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'cap'
})
export class CapPipe implements PipeTransform {

  transform(value: unknown, ...args: unknown[]): unknown {
    if (typeof value === 'string') {
      return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
    }
    return value;
  }

}
