import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowLeft, LucideMessageCircle } from '@lucide/angular';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [RouterLink, LucideArrowLeft, LucideMessageCircle],
  templateUrl: './contact.html',
  styleUrl: './contact.scss',
})
export class Contact {}
