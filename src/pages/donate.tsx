import React from "react";
import {
  Box,
  Typography,
  Button,
  Container,
  Card,
  CardContent,
} from "@mui/material";
import { useRouter } from "next/router";

export default function DonatePage() {
  const router = useRouter();

  const handleDonate = (amount: number) => {
    // TODO: Replace with actual Stripe checkout or other payment logic
    alert(`Donating $${amount} (Not implemented yet)`);
  };

  return (
    <Box
      sx={{
        fontFamily: "Inter, sans-serif",
        backgroundColor: "#1F2023",
        color: "#ECECF1",
        minHeight: "100vh",
      }}
    >
      {/* Hero-ish Top Section */}
      <Box sx={{ textAlign: "center", py: 10, backgroundColor: "#2C2D31" }}>
        <Typography variant="h3" sx={{ fontWeight: 700, mb: 2 }}>
          Support Our Unofficial Project
        </Typography>
        <Typography
          variant="body1"
          sx={{ maxWidth: 600, mx: "auto", opacity: 0.9 }}
        >
          This project is non-profit and open-source. Your donation helps cover
          server costs and keeps our Deepseek Playground running freely for
          everyone.
        </Typography>
      </Box>

      <Container maxWidth="md" sx={{ py: 8 }}>
        <Typography
          variant="h4"
          sx={{ fontWeight: 600, mb: 4, textAlign: "center" }}
        >
          Donate &amp; Help Us Grow
        </Typography>

        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            justifyContent: "center",
          }}
        >
          {/* Donation Card Example */}
          <Card sx={{ width: 260, backgroundColor: "#2A2B32" }}>
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
                Small Support
              </Typography>
              <Typography variant="body2" color="#bfbfbf" sx={{ mb: 3 }}>
                Contribute <strong>$1</strong> to help with basic server
                maintenance.
              </Typography>
              <Button
                variant="contained"
                href="https://buy.stripe.com/test_xxx123" // TODO: 実装
                sx={{
                  backgroundColor: "#00B8D9",
                  "&:hover": { backgroundColor: "#00A0BD" },
                  textTransform: "none",
                  fontWeight: 600,
                }}
                onClick={() => handleDonate(1)}
              >
                Donate $1
              </Button>
            </CardContent>
          </Card>

          <Card sx={{ width: 260, backgroundColor: "#2A2B32" }}>
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
                Steady Boost
              </Typography>
              <Typography variant="body2" color="#bfbfbf" sx={{ mb: 3 }}>
                Contribute <strong>$10</strong> to cover a decent chunk of
                monthly costs.
              </Typography>
              <Button
                variant="contained"
                href="https://buy.stripe.com/test_xxx123" // TODO: 実装
                sx={{
                  backgroundColor: "#00B8D9",
                  "&:hover": { backgroundColor: "#00A0BD" },
                  textTransform: "none",
                  fontWeight: 600,
                }}
                onClick={() => handleDonate(10)}
              >
                Donate $10
              </Button>
            </CardContent>
          </Card>

          <Card sx={{ width: 260, backgroundColor: "#2A2B32" }}>
            <CardContent>
              <Typography variant="h5" sx={{ fontWeight: 600, mb: 2 }}>
                Major Contribution
              </Typography>
              <Typography variant="body2" color="#bfbfbf" sx={{ mb: 3 }}>
                Contribute <strong>$100</strong> or more to significantly
                support our hosting and development efforts.
              </Typography>
              <Button
                variant="contained"
                href="https://buy.stripe.com/test_xxx123" // TODO: 実装
                sx={{
                  backgroundColor: "#00B8D9",
                  "&:hover": { backgroundColor: "#00A0BD" },
                  textTransform: "none",
                  fontWeight: 600,
                }}
                onClick={() => handleDonate(100)}
              >
                Donate $100
              </Button>
            </CardContent>
          </Card>
        </Box>

        {/* Additional Explanation */}
        <Box sx={{ mt: 6, textAlign: "center" }}>
          <Typography
            variant="body1"
            color="#bfbfbf"
            sx={{ maxWidth: 600, mx: "auto", mb: 2 }}
          >
            Your donation is completely voluntary. We appreciate any
            contribution, no matter how small. By supporting this unofficial,
            open-source project, you help us maintain and improve the service
            for everyone who wants to explore AI capabilities using Deepseek.
          </Typography>
          <Typography
            variant="body1"
            color="#bfbfbf"
            sx={{ maxWidth: 600, mx: "auto" }}
          >
            Thank you for being part of our community!
          </Typography>
        </Box>
      </Container>
    </Box>
  );
}
