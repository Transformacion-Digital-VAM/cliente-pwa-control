import { Component, Inject, PLATFORM_ID, ElementRef, ViewChild } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-whatsapp-button',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './whatsapp-button.html',
  styleUrl: './whatsapp-button.css'
})
export class WhatsappButton {
  isOpen = false;
  message = '';
  readonly phoneNumber = '524181760210';
  readonly displayPhone = '418 176 0210';

  @ViewChild('msgInput') msgInputElement?: ElementRef<HTMLTextAreaElement>;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) { }

  toggleModal() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      setTimeout(() => {
        this.msgInputElement?.nativeElement?.focus();
      }, 150);
    }
  }

  closeModal() {
    this.isOpen = false;
  }

  setQuickMessage(text: string) {
    this.message = text;
    this.msgInputElement?.nativeElement?.focus();
  }

  sendMessage() {
    if (!isPlatformBrowser(this.platformId)) return;

    const text = this.message.trim();
    const finalMessage = text.length > 0 ? text : 'Hola, me comunico desde la App de Hoja de Control.';
    const encodedText = encodeURIComponent(finalMessage);
    const whatsappUrl = `https://wa.me/${this.phoneNumber}?text=${encodedText}`;

    window.open(whatsappUrl, '_blank');
    this.message = '';
    this.isOpen = false;
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }
}
