import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/game", destination: "/leaderboard-prizes", permanent: true },
    ];
  },
};

export default nextConfig;
