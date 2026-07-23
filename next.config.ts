import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Runtime Node.js é o padrão do projeto (ADR-008); rotas não devem optar por
  // Edge sem decisão registrada.
  reactStrictMode: true,
};

export default nextConfig;
