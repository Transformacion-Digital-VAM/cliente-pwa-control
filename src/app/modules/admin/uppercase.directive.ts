import { Directive, HostListener, Optional, Self } from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
  selector: 'input[type=text], textarea, input:not([type])',
  standalone: true
})
export class UppercaseDirective {

  constructor(@Optional() @Self() private ngControl: NgControl) {}

  @HostListener('input', ['$event']) onInput(event: Event) {
    const target = event.target as HTMLInputElement;
    if (!target) return;
    
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const upper = target.value.toUpperCase();

    target.value = upper;

    if (this.ngControl && this.ngControl.control) {
      this.ngControl.control.setValue(upper, { emitEvent: false });
    }

    target.setSelectionRange(start, end);
  }
}
