# Bootstrap do primeiro platform admin

Procedimento manual e controlado; nunca é executado por migration, seed, domínio
de e-mail ou rota normal da aplicação.

1. Confirme fora de banda a identidade e obtenha o `user_id` em `auth.users`.
2. Exija aprovação de duas pessoas e registre o ticket da mudança.
3. Em uma conexão administrativa protegida, valide que o UUID existe e insira
   explicitamente `user_id` e `created_by` em `public.platform_admins`.
4. Confirme MFA TOTP verificado e teste `current_user_is_platform_admin`.
5. Registre a operação no sistema corporativo de auditoria e encerre a conexão.

Não coloque UUID, e-mail ou credencial neste documento, em migration ou seed. Em
produção, confira ambiente/projeto antes e depois da mudança. Remover a linha de
`platform_admins` revoga imediatamente o privilégio e torna todos os grants
existentes daquele usuário inertes. Não há recuperação administrativa de MFA na
F1.
