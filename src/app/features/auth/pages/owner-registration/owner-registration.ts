import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../../core/auth';

@Component({
  selector:'app-owner-registration',standalone:true,imports:[ReactiveFormsModule,RouterLink],
  template:`
    <main class="onboarding">
      <a class="brand" routerLink="/"><img src="assets/images/fasoecole-logo-alt.svg" alt="FasoEcole · retour à l’accueil" /></a>
      <div class="layout">
        <aside><p class="eyebrow">VOTRE ÉTABLISSEMENT, VOTRE ESPACE</p><h1>Rejoignez FasoEcole avec votre établissement.</h1>
          <p>Préparez votre organisation scolaire et réunissez votre équipe dans un même espace.</p>
          <ol><li><strong>Votre compte propriétaire</strong><span>Créez votre compte et confirmez votre courriel.</span></li>
            <li><strong>La préparation de votre école</strong><span>Renseignez l’établissement, les classes, les enseignants et les élèves.</span></li>
            <li><strong>La validation de la plateforme</strong><span>Soumettez votre établissement. L’administrateur vérifie puis active son accès.</span></li></ol>
          <a routerLink="/">← Retour à l’accueil</a>
        </aside>
        <section class="card">
          @if (auth.isAuthenticated()) {
            <p class="eyebrow">VOTRE COMPTE EXISTANT</p><h2>Bonjour {{ auth.user()?.firstName }}</h2>
            @if (ready()) {
              <p>Utilisez votre compte pour préparer un nouvel établissement. Vos dossiers et accès actuels sont conservés.</p>
              @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
              <button type="button" (click)="continueWithAccount()" [disabled]="busy()">{{ busy()?'Préparation…':'Continuer avec mon compte' }}</button>
            } @else {
              <p>Confirmez votre courriel et terminez les étapes demandées dans votre profil avant de préparer un établissement.</p>
              <a class="button" routerLink="/profil">Ouvrir mon profil</a>
            }
          } @else if (success()) {
            <p class="eyebrow">PROCHAINE ÉTAPE</p><h2>Consultez votre courriel</h2><p class="notice" role="status">{{ success() }}</p>
            <p>Après confirmation de votre adresse, connectez-vous pour préparer votre école.</p>
            <a class="button" routerLink="/login" [queryParams]="{next:'school-setup'}">Se connecter pour continuer</a>
          } @else {
            <p class="eyebrow">PREMIÈRE ÉTAPE</p><h2>Créer mon compte propriétaire</h2>
            <p>Vous avez déjà un compte ? <a routerLink="/login" [queryParams]="{next:'school-setup'}">Connectez-vous</a></p>
            @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
            <form [formGroup]="form" (ngSubmit)="register()" novalidate>
              <div class="names"><label>Prénom<input type="text" formControlName="firstName" autocomplete="given-name" required maxlength="100" /></label>
                <label>Nom<input type="text" formControlName="lastName" autocomplete="family-name" required maxlength="100" /></label></div>
              <label>Courriel<input type="email" formControlName="email" autocomplete="email" required maxlength="150" /></label>
              <label>Téléphone<input type="tel" formControlName="phone" autocomplete="tel" maxlength="30" /></label>
              <label>Mot de passe<input [type]="showPassword()?'text':'password'" formControlName="password" autocomplete="new-password" required minlength="8" maxlength="100" /></label>
              <label>Confirmer le mot de passe<input [type]="showPassword()?'text':'password'" formControlName="confirmPassword" autocomplete="new-password" required minlength="8" maxlength="100" /></label>
              <button class="text-button" type="button" [attr.aria-pressed]="showPassword()" (click)="showPassword.set(!showPassword())">{{ showPassword()?'Masquer':'Afficher' }} les mots de passe</button>
              <small>Utilisez de 8 à 100 caractères. Les informations de l’établissement seront demandées après confirmation du courriel.</small>
              <button type="submit" [disabled]="busy()">{{ busy()?'Envoi…':'Créer mon compte propriétaire' }}</button>
            </form>
          }
        </section>
      </div>
    </main>
  `,
  styles:[`
    :host{display:block;background:#f5f8f3;min-height:100vh;color:#203f32}.onboarding{max-width:1200px;margin:auto;padding:28px}.brand img{width:170px}.layout{display:grid;grid-template-columns:1fr 1fr;gap:65px;margin-top:45px;align-items:start}.eyebrow{font-size:11px;font-weight:700;color:#228053;letter-spacing:.13em}h1{font-size:38px;line-height:1.2}h2{font-size:25px;margin:12px 0}p{color:#64786a;font-size:14px;line-height:1.7}a{color:#19764f}ol{padding-left:22px;margin:35px 0}li{padding:12px 0 12px 8px;font-size:14px}li span{display:block;color:#718375;font-size:13px;margin-top:7px;line-height:1.6}.card{background:#fff;padding:32px;border:1px solid #dfe9de;border-radius:20px;box-shadow:0 16px 50px #2c513410}.names{display:grid;grid-template-columns:1fr 1fr;gap:14px}form{display:grid;gap:15px}label{display:grid;gap:7px;font-size:13px;font-weight:600}input{padding:12px;border:1px solid #ccdccd;border-radius:9px;font:inherit;min-width:0}input.ng-touched.ng-invalid{border-color:#bb4940}button,.button{font:inherit;font-size:14px;background:#19764f;color:#fff;border:0;border-radius:9px;padding:13px 18px;cursor:pointer;text-decoration:none;display:inline-block}button:disabled{opacity:.6;cursor:default}.text-button{background:none;color:#19764f;padding:0;text-align:left;font-size:12px}small{font-size:12px;line-height:1.7;color:#718375}.error,.notice{padding:14px;border-radius:9px}.error{background:#fff0ed;color:#a93f32}.notice{background:#eaf6ed;color:#19764f}@media(max-width:800px){.layout{grid-template-columns:1fr;gap:25px;margin-top:25px}h1{font-size:29px}.onboarding{padding:20px}.card{padding:24px}.names{grid-template-columns:1fr}}
  `],
})
export class OwnerRegistration {
  readonly auth=inject(AuthService);
  private readonly fb=inject(FormBuilder);
  private readonly router=inject(Router);
  private readonly destroyRef=inject(DestroyRef);
  readonly busy=signal(false);
  readonly error=signal('');
  readonly success=signal('');
  readonly showPassword=signal(false);
  readonly ready=computed(()=>{const user=this.auth.user();return !!user?.approved && user.emailVerified===true && !user.mustChangePassword;});
  readonly form=this.fb.nonNullable.group({
    firstName:['',[Validators.required,Validators.maxLength(100)]],lastName:['',[Validators.required,Validators.maxLength(100)]],
    email:['',[Validators.required,Validators.email,Validators.maxLength(150)]],phone:['',Validators.maxLength(30)],
    password:['',[Validators.required,Validators.minLength(8),Validators.maxLength(100)]],
    confirmPassword:['',[Validators.required,Validators.minLength(8),Validators.maxLength(100)]],
  });
  register():void {
    if(this.busy()) return;
    this.error.set('');
    for(const name of ['firstName','lastName','email','phone'] as const) this.form.controls[name].setValue(this.form.controls[name].value.trim());
    if(this.form.invalid) { this.form.markAllAsTouched();this.error.set('Renseignez votre identité, un courriel valide et un mot de passe de 8 à 100 caractères.');return; }
    const {confirmPassword,...request}=this.form.getRawValue();
    if(request.password!==confirmPassword) { this.error.set('Les deux mots de passe ne correspondent pas.');return; }
    request.email=request.email.toLowerCase();this.busy.set(true);
    this.auth.registerOwner(request).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next:response=>{this.busy.set(false);this.success.set(response.message);this.form.reset();},
      error:err=>{this.busy.set(false);this.error.set(err.status===429?'Trop de demandes. Réessayez dans une minute.':'L’inscription n’a pas pu être envoyée. Réessayez plus tard.');},
    });
  }
  continueWithAccount():void {
    if(this.busy() || !this.ready()) return;
    if(this.auth.isSchoolOwner()) {this.router.navigateByUrl('/proprietaire/creer-ecole');return;}
    this.busy.set(true);this.error.set('');
    this.auth.enableOwnerAccount().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next:()=>{this.busy.set(false);this.router.navigateByUrl('/proprietaire/creer-ecole');},
      error:()=>{this.busy.set(false);this.error.set('Impossible de préparer votre établissement. Vérifiez l’état de votre compte dans Mon profil.');},
    });
  }
}
