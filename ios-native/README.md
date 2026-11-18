# PulsoFit iOS nativo — GPS em segundo plano

Este diretório contém o **código-fonte de integração nativa** para executar o PulsoFit em um app iOS com CoreLocation. Não é um IPA e **não está assinado, compilado nem instalado**. Um site/PWA no Safari não tem permissão de executar GPS continuamente com a tela bloqueada.

## Montagem no Xcode (Mac)

1. Crie um projeto **iOS App** chamado `PulsoFitNative` no Xcode, com SwiftUI e um **Bundle Identifier** de sua propriedade.
2. Adicione `PulsoFitNativeApp.swift` e `PulsoFitBackgroundTracker.swift` ao *target* principal.
3. Mescle as chaves de `Info.plist.template` no Info do target. Em **Signing & Capabilities**, vincule uma equipe Apple Developer e habilite **Background Modes → Location updates**.
4. Faça build em um iPhone real com iOS compatível, autorize *Localização Sempre* em **Ajustes → PulsoFit → Localização** e aceite notificações para receber atualizações do percurso na tela bloqueada.
5. No **Outdoor Live**, inicie a atividade, bloqueie a tela, faça um percurso real e confira se as amostras de GPS foram recebidas quando voltar ao app. Pause/finalize para interromper a localização.
6. Teste também sem permissões e com precisão reduzida; o app não deve inventar distância, passos ou GPS.

## Interface site ↔ app

O app injeta somente no domínio confiável `https://pulso-fit-ai-95-online.onrender.com`:

```js
window.PulsoFitNative = { isAvailable: true, platform: "ios" };
window.webkit.messageHandlers.pulsoLocation.postMessage({action:"start",kind:"walk"});
// action: start | pause | resume | finish
```

O CoreLocation responde via eventos `pulso-native-location` e `pulso-native-location-error` usados por `server/pulsofit-outdoor-ui.js`. Quando o webview fica suspenso, o código nativo mantém as coordenadas **em memória** e as entrega ao retornar à tela; não publica automaticamente o trajeto em nenhum servidor. Sem autorização *Sempre*, o sistema pode impedir o GPS em segundo plano.

## Limitações e privacidade

- Não fornece automaticamente **Live Activity / Dynamic Island**: isso requer uma extensão WidgetKit/ActivityKit, assinatura e teste no aparelho. As notificações locais são apenas atualizações periódicas quando o sistema fornece localização.
- O iOS pode suspender ou encerrar processos por bateria, permissões, condições do sistema ou restrições do dispositivo. Mesmo um app nativo não garante atualizações a cada segundo.
- O buffer nativo é temporário e limitado. Se o sistema encerrar o processo antes de voltar, pode haver perda de pontos; para persistência forte, adicionar armazenamento nativo criptografado com consentimento específico.
- O app embute uma página web; autenticação externa (Google/Apple) e pagamentos devem ser revisados no contexto nativo, de preferência com fluxos de browser do sistema e *universal links*. O presente esqueleto não afirma que OAuth em WKWebView esteja pronto.
- Não solicite localização de outro usuário e não colete posição quando uma atividade não estiver iniciada.
- Para distribuir na App Store ou gerar IPA, faltam **compilação no Mac, perfil de provisionamento, assinatura Apple Developer, revisão do aplicativo e testes físicos**.

## O que já foi publicado na web

A versão web incorpora as correções de layouts, o aviso único de pagamento, avatar personalizado e suporte ao bridge nativo. No Safari o app continua pausando a localização ao bloquear para não inventar percurso; as notificações push de duração permanecem uma função separada e dependem de inscrição do dispositivo.
