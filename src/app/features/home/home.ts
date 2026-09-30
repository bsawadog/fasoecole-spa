import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideArrowRight,
  LucideBookOpen,
  LucideChartNoAxesColumnIncreasing,
  LucideChevronDown,
  LucideClipboardList,
  LucideGraduationCap,
  LucideHeartHandshake,
  LucideLightbulb,
  LucideMessageCircle,
  LucideSchool,
  LucideUsersRound,
} from '@lucide/angular';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    RouterLink,
    LucideArrowRight,
    LucideBookOpen,
    LucideChartNoAxesColumnIncreasing,
    LucideChevronDown,
    LucideClipboardList,
    LucideGraduationCap,
    LucideHeartHandshake,
    LucideLightbulb,
    LucideMessageCircle,
    LucideSchool,
    LucideUsersRound,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {}
